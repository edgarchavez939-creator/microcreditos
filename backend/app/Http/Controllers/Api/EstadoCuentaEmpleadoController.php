<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\EstadoCuentaService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Estado de Cuenta del Empleado. Consultable por administración; toda la lógica
 * financiera vive en EstadoCuentaService (punto único).
 */
class EstadoCuentaEmpleadoController extends Controller
{
    public function __construct(private EstadoCuentaService $svc) {}

    private function soloAdmin(Request $request): void
    {
        abort_unless($request->user()?->esAdministrador(), 403, 'Acceso exclusivo de administración.');
    }

    /** Estado de cuenta completo de un empleado: resumen + obligaciones + extracto. */
    public function show(Request $request, int $empleado)
    {
        $this->soloAdmin($request);

        $obligaciones = DB::table('obligaciones_empleado')
            ->where('empleado_id', $empleado)
            ->orderByDesc('created_at')
            ->get();

        $movimientos = DB::table('movimientos_empleado as m')
            ->leftJoin('usuarios as u', 'u.id', '=', 'm.registrado_por')
            ->where('m.empleado_id', $empleado)
            ->orderByDesc('m.created_at')
            ->limit(500)
            ->get(['m.id', 'm.tipo', 'm.concepto', 'm.debito', 'm.credito',
                   'm.saldo_obligacion', 'm.observaciones', 'm.created_at', 'u.nombre as registrado_por']);

        return response()->json(['data' => [
            'resumen'      => $this->svc->resumen($empleado),
            'obligaciones' => $obligaciones,
            'movimientos'  => $movimientos,
        ]]);
    }

    /** Registra un préstamo interno (sin intereses, sin plazo). */
    public function crearPrestamo(Request $request, int $empleado)
    {
        $this->soloAdmin($request);
        $data = $request->validate([
            'monto'         => ['required', 'numeric', 'gt:0'],
            'concepto'      => ['required', 'string', 'max:160'],
            'observaciones' => ['nullable', 'string', 'max:1000'],
        ]);

        $id = $this->svc->crearObligacion(
            $empleado, 'PRESTAMO_INTERNO', $data['concepto'], (float) $data['monto'],
            $request, $data['observaciones'] ?? null
        );

        return response()->json(['message' => 'Préstamo registrado.', 'id' => $id], 201);
    }

    /** Consolida manualmente los descuadres de la semana (también se dispara al cierre del sábado). */
    public function consolidarDescuadres(Request $request, int $empleado)
    {
        $this->soloAdmin($request);
        $id = $this->svc->consolidarDescuadresSemana($empleado, $request);
        if ($id === null) {
            return response()->json(['message' => 'No hay descuadres pendientes de consolidar esta semana.'], 200);
        }
        return response()->json(['message' => 'Descuadres consolidados en una obligación.', 'id' => $id], 201);
    }

    /** Registra un abono a una obligación (monto libre). */
    public function abonar(Request $request, int $empleado, int $obligacion)
    {
        $this->soloAdmin($request);
        $data = $request->validate([
            'monto'         => ['required', 'numeric', 'gt:0'],
            'observaciones' => ['nullable', 'string', 'max:1000'],
        ]);

        $r = $this->svc->abonar($obligacion, (float) $data['monto'], $request, $data['observaciones'] ?? null);
        return response()->json(['message' => 'Abono registrado.', 'saldo' => $r['saldo'], 'estado' => $r['estado']]);
    }

    /** Resumen consolidado por empleado (para el listado general). */
    public function consolidado(Request $request)
    {
        $this->soloAdmin($request);

        $filas = DB::table('obligaciones_empleado as o')
            ->join('usuarios as u', 'u.id', '=', 'o.empleado_id')
            ->where('o.estado', 'PENDIENTE')
            ->groupBy('u.id', 'u.nombre', 'u.rol')
            ->select('u.id as empleado_id', 'u.nombre', 'u.rol',
                DB::raw('SUM(o.saldo) as saldo_pendiente'),
                DB::raw("SUM(CASE WHEN o.tipo = 'DESCUADRE_CAJA' THEN o.saldo ELSE 0 END) as saldo_descuadres"),
                DB::raw("SUM(CASE WHEN o.tipo = 'PRESTAMO_INTERNO' THEN o.saldo ELSE 0 END) as saldo_prestamos"),
                DB::raw('COUNT(*) as obligaciones_activas'))
            ->orderByDesc('saldo_pendiente')
            ->get();

        return response()->json([
            'data' => $filas,
            'total_pendiente' => round((float) $filas->sum('saldo_pendiente'), 2),
        ]);
    }
}

<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CierreCaja;
use App\Services\MoraService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CajaController extends Controller
{
    /** 5) Ruta del día: cobros de hoy + mora, con datos del cliente y GPS, según el rol. */
    public function rutaDia(Request $request, MoraService $mora)
    {
        $mora->sincronizar();
        $u = $request->user();

        // CONSOLIDADO POR CRÉDITO: una sola fila por solicitud, agrupando sus cuotas
        // vencidas/del-día en la base de datos (sin consultas por cuota). Un cliente con
        // dos créditos genera dos filas; un crédito con 8 cuotas vencidas genera una.
        $q = DB::table('cuotas as q')
            ->join('solicitudes as s', 's.id', '=', 'q.solicitud_id')
            ->join('clientes as c', 'c.id', '=', 's.cliente_id')
            ->leftJoin('usuarios as uc', 'uc.id', '=', 's.cobrador_id')
            ->whereIn('q.estado', ['PENDIENTE', 'PARCIAL', 'VENCIDA'])
            ->where(function ($w) {
                $w->whereDate('q.fecha_vencimiento', now()->toDateString())
                  ->orWhere('q.estado', 'VENCIDA');
            });

        if ($u->esCobrador()) {
            $q->where(fn ($w) => $w->where('s.cobrador_id', $u->id)->orWhere('s.created_by', $u->id));
        } elseif ($u->esSupervisor()) {
            $areas = DB::table('usuario_area')->where('usuario_id', $u->id)->pluck('area_id');
            $q->whereIn('s.area_id', $areas);
        }

        $filas = $q
            ->groupBy('s.id', 's.numero_credito', 'c.nombres', 'c.apellidos',
                      'c.telefono_principal', 'c.direccion', 'c.barrio',
                      'c.latitud', 'c.longitud', 'uc.nombre')
            ->orderByRaw("CASE WHEN MAX(CASE WHEN q.estado='VENCIDA' THEN 1 ELSE 0 END)=1 THEN 0 ELSE 1 END")
            ->orderByRaw('MIN(q.fecha_vencimiento)')
            ->limit(300)
            ->get([
                's.id as solicitud_id', 's.numero_credito',
                // ¿el crédito tiene al menos una cuota vencida? define su estado y sección
                DB::raw("(CASE WHEN MAX(CASE WHEN q.estado='VENCIDA' THEN 1 ELSE 0 END)=1 THEN 'VENCIDA' ELSE 'HOY' END) as estado"),
                DB::raw('COUNT(*) as cuotas_vencidas'),
                DB::raw('MIN(q.numero_cuota) as cuota_desde'),
                DB::raw('MAX(q.numero_cuota) as cuota_hasta'),
                DB::raw('MIN(q.fecha_vencimiento) as fecha_mas_antigua'),
                DB::raw('CAST(SUM(q.valor - q.valor_pagado) AS FLOAT) as valor_pendiente'),
                // Días de mora de la cuota más antigua = el máximo de dias_mora del grupo
                DB::raw('COALESCE(MAX(q.dias_mora),0) as dias_mora'),
                DB::raw("TRIM(c.nombres || ' ' || c.apellidos) as cliente"),
                'c.telefono_principal as telefono', 'c.direccion', 'c.barrio',
                DB::raw('CAST(c.latitud AS FLOAT) as latitud'),
                DB::raw('CAST(c.longitud AS FLOAT) as longitud'),
                'uc.nombre as cobrador',
            ]);

        $hoy = $filas->where('estado', '!=', 'VENCIDA');
        $vencidas = $filas->where('estado', 'VENCIDA');

        return response()->json([
            'data' => $filas->values(),
            'resumen' => [
                'cobros_hoy' => ['cantidad' => $hoy->count(), 'total' => (float) $hoy->sum('valor_pendiente')],
                'en_mora'    => ['cantidad' => $vencidas->count(), 'total' => (float) $vencidas->sum('valor_pendiente')],
            ],
        ]);
    }

    /** 6) Resumen del día del usuario: lo recaudado hoy (para cerrar caja). */
    public function resumenDia(Request $request)
    {
        $u = $request->user();
        $caja = app(\App\Services\CajaService::class);
        $estado = $caja->estadoDia($u->id);

        $cierre = CierreCaja::whereDate('fecha', $estado['fecha'])->where('cerrado_por', $u->id)->first();

        return response()->json(['data' => array_merge($estado, [
            'ya_cerrada'   => (bool) $cierre,
            'cierre'       => $cierre,
            'movimientos'  => $caja->movimientosDia($u->id),
            'tipos_gasto'  => \App\Services\CajaService::TIPOS_GASTO,
        ])]);
    }

    /** Registrar la BASE INICIAL del día (una sola vez). */
    public function registrarBase(Request $request)
    {
        $u = $request->user();
        $hoy = now()->toDateString();

        $data = $request->validate([
            'valor'       => ['required', 'numeric', 'gt:0'],
            'observacion' => ['nullable', 'string', 'max:255'],
        ]);

        abort_if(
            CierreCaja::whereDate('fecha', $hoy)->where('cerrado_por', $u->id)->exists(),
            422, 'La caja de hoy ya está cerrada.'
        );
        abort_if(
            DB::table('movimientos_caja')->whereDate('fecha', $hoy)
                ->where('registrado_por', $u->id)->where('referencia_tipo', 'BASE_INICIAL')->exists(),
            422, 'Ya registraste la base inicial de hoy.'
        );

        $areaId = DB::table('usuario_area')->where('usuario_id', $u->id)->value('area_id');
        $id = DB::table('movimientos_caja')->insertGetId([
            'fecha' => $hoy, 'tipo' => 'INGRESO', 'concepto' => 'Base inicial',
            'valor' => $data['valor'], 'medio_pago' => 'EFECTIVO',
            'referencia_tipo' => 'BASE_INICIAL', 'area_id' => $areaId,
            'observacion' => $data['observacion'] ?? null,
            'registrado_por' => $u->id, 'created_at' => now(),
        ]);
        $this->auditarCaja($request, 'CREATE', 'BASE_INICIAL', $id, $data['valor']);

        return response()->json(['message' => 'Base inicial registrada.'], 201);
    }

    /** Registrar un GASTO en cualquier momento del día. */
    public function registrarGasto(Request $request)
    {
        $u = $request->user();
        $hoy = now()->toDateString();

        $data = $request->validate([
            'subtipo'     => ['required', 'in:' . implode(',', \App\Services\CajaService::TIPOS_GASTO)],
            'valor'       => ['required', 'numeric', 'gt:0'],
            'medio_pago'  => ['nullable', 'in:EFECTIVO,TRANSFERENCIA,NEQUI,DAVIPLATA'],
            'observacion' => ['nullable', 'string', 'max:255'],
        ]);

        abort_if(
            CierreCaja::whereDate('fecha', $hoy)->where('cerrado_por', $u->id)->exists(),
            422, 'La caja de hoy ya está cerrada; no se pueden registrar más gastos.'
        );

        $areaId = DB::table('usuario_area')->where('usuario_id', $u->id)->value('area_id');
        $labels = [
            'ALIMENTACION' => 'Alimentación', 'COMBUSTIBLE' => 'Combustible', 'PARQUEADERO' => 'Parqueadero',
            'PEAJES' => 'Peajes', 'VEHICULO' => 'Gastos del vehículo', 'PAPELERIA' => 'Papelería', 'OTROS' => 'Otros',
        ];
        $id = DB::table('movimientos_caja')->insertGetId([
            'fecha' => $hoy, 'tipo' => 'EGRESO',
            'concepto' => 'Gasto: ' . ($labels[$data['subtipo']] ?? $data['subtipo']),
            'subtipo' => $data['subtipo'], 'valor' => $data['valor'],
            'medio_pago' => $data['medio_pago'] ?? 'EFECTIVO',
            'referencia_tipo' => 'GASTO', 'area_id' => $areaId,
            'observacion' => $data['observacion'] ?? null,
            'registrado_por' => $u->id, 'created_at' => now(),
        ]);
        $this->auditarCaja($request, 'CREATE', 'GASTO', $id, $data['valor']);

        return response()->json(['message' => 'Gasto registrado.'], 201);
    }

    /** Eliminar un gasto (solo si la caja no está cerrada y es del propio usuario). */
    public function eliminarGasto(Request $request, int $id)
    {
        $u = $request->user();
        $hoy = now()->toDateString();

        abort_if(
            CierreCaja::whereDate('fecha', $hoy)->where('cerrado_por', $u->id)->exists(),
            422, 'La caja está cerrada; no se pueden eliminar movimientos.'
        );

        $mov = DB::table('movimientos_caja')->where('id', $id)
            ->where('registrado_por', $u->id)->where('referencia_tipo', 'GASTO')->first();
        abort_unless($mov, 404, 'Gasto no encontrado.');

        DB::table('movimientos_caja')->where('id', $id)->delete();
        $this->auditarCaja($request, 'DELETE', 'GASTO', $id, (float) $mov->valor);

        return response()->json(['message' => 'Gasto eliminado.']);
    }

    /** 6) Cerrar la caja del día con arqueo de efectivo. */
    public function cerrar(Request $request)
    {
        $u = $request->user();
        $hoy = now()->toDateString();

        abort_if(
            CierreCaja::whereDate('fecha', $hoy)->where('cerrado_por', $u->id)->exists(),
            422, 'Ya cerraste la caja de hoy.'
        );

        $caja = app(\App\Services\CajaService::class);
        $e = $caja->estadoDia($u->id);

        $data = $request->validate([
            'efectivo_contado' => ['required', 'numeric', 'gte:0'],
            'observacion'      => ['nullable', 'string', 'max:500'],
        ]);

        $diferencia = round($data['efectivo_contado'] - $e['efectivo_esperado'], 2);

        // Si hay diferencia, la observación es obligatoria (control de tesorería)
        if (abs($diferencia) >= 0.01 && empty($data['observacion'])) {
            return response()->json([
                'message' => 'Hay una diferencia de caja. Debes registrar una observación explicando la novedad.',
                'diferencia' => $diferencia,
            ], 422);
        }

        $areaId = DB::table('usuario_area')->where('usuario_id', $u->id)->value('area_id');

        $cierre = CierreCaja::create([
            'fecha'                => $hoy,
            'area_id'              => $areaId,
            'base_inicial'         => $e['base_inicial'],
            'cobros_efectivo'      => $e['cobros_efectivo'],
            'cobros_transferencia' => $e['cobros_transferencia'],
            'recaudo_seguros'      => $e['recaudo_seguros'],
            'total_desembolsos'    => $e['total_desembolsos'],
            'total_gastos'         => $e['total_gastos'],
            'total_ingresos'       => round($e['base_inicial'] + $e['total_cobros'] + $e['recaudo_seguros'], 2),
            'total_egresos'        => round($e['total_desembolsos'] + $e['total_gastos'], 2),
            'saldo'                => $e['saldo_final'],
            'efectivo_esperado'    => $e['efectivo_esperado'],
            'efectivo_contado'     => $data['efectivo_contado'],
            'diferencia'           => $diferencia,
            'hora_apertura'        => $e['hora_apertura'],
            'hora_cierre'          => now(),
            'observacion'          => $data['observacion'] ?? null,
            'cerrado_por'          => $u->id,
        ]);

        $accion = abs($diferencia) >= 0.01 ? 'CLOSE_DIFF' : 'CLOSE';
        $this->auditarCaja($request, $accion, 'CIERRE', $cierre->id, $diferencia);

        return response()->json(['message' => 'Caja cerrada.', 'data' => $cierre], 201);
    }

    /** Registro de auditoría para movimientos de caja. */
    private function auditarCaja(Request $request, string $accion, string $tipo, int $id, float $valor): void
    {
        DB::table('auditoria')->insert([
            'usuario_id' => $request->user()->id,
            'accion'     => $accion,
            'entidad'    => 'caja',
            'entidad_id' => $id,
            'datos_nuevos' => json_encode(['tipo' => $tipo, 'valor' => $valor]),
            'ip'         => $request->ip(),
            'user_agent' => $request->userAgent(),
            'created_at' => now(),
        ]);
    }

    /** 6) Historial de cierres (el cobrador ve los suyos; supervisor/admin, según alcance). */
    public function cierres(Request $request)
    {
        $u = $request->user();

        $q = DB::table('cierres_caja as cc')
            ->leftJoin('usuarios as us', 'us.id', '=', 'cc.cerrado_por')
            ->leftJoin('areas as a', 'a.id', '=', 'cc.area_id');

        if ($u->esCobrador()) {
            $q->where('cc.cerrado_por', $u->id);
        } elseif ($u->esSupervisor()) {
            $areas = DB::table('usuario_area')->where('usuario_id', $u->id)->pluck('area_id');
            $q->where(fn ($w) => $w->whereIn('cc.area_id', $areas)->orWhere('cc.cerrado_por', $u->id));
        }

        $filas = $q->orderByDesc('cc.fecha')->limit(60)->get([
            'cc.id', 'cc.fecha', 'cc.total_ingresos', 'cc.total_egresos', 'cc.saldo',
            'us.nombre as cerrado_por', 'a.nombre as area', 'cc.created_at',
        ]);

        return response()->json(['data' => $filas]);
    }
}

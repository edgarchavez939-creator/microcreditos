<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\PermisoService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * CENTRO DE VALIDACIÓN DE MIGRACIONES (Fase 2).
 *
 * Bandeja de créditos MIGRADO con sus estados de validación:
 *   PENDIENTE → VALIDADO / CORREGIDO → BLOQUEADO (automático al primer movimiento).
 *
 * Autorización por la MATRIZ DE PERMISOS (nunca por rol):
 *   - 'migrados.validar' para marcar validado.
 *   - 'migrados.editar' para la edición controlada.
 * El acceso a la bandeja lo da el módulo 'migracion' + alcance territorial
 * (un supervisor con el módulo concedido solo ve créditos de sus áreas).
 */
class ValidacionMigracionController extends Controller
{
    /** Campos editables en la validación (edición controlada). */
    private const EDITABLES = [
        'producto_financiero_id', 'saldo_pendiente', 'valor_original',
        'numero_cuotas', 'fecha_desembolso', 'area_id', 'cobrador_id', 'modalidad',
    ];

    /** Bandeja con filtros y búsqueda rápida. */
    public function index(Request $request)
    {
        $u = $request->user();
        $areas = $u->areasVisibles();   // null = sin restricción

        $q = DB::table('solicitudes as s')
            ->join('clientes as c', 'c.id', '=', 's.cliente_id')
            ->leftJoin('areas as a', 'a.id', '=', 's.area_id')
            ->leftJoin('usuarios as cob', 'cob.id', '=', 's.cobrador_id')
            ->leftJoin('productos_financieros as pf', 'pf.id', '=', 's.producto_financiero_id')
            ->leftJoin('migraciones as m', 'm.id', '=', 's.migracion_id')
            ->leftJoin('usuarios as imp', 'imp.id', '=', 'm.importado_por')
            ->whereNotNull('s.migracion_id');

        if ($areas !== null) $q->whereIn('s.area_id', $areas);

        // Filtros
        if ($v = $request->query('estado_validacion')) $q->where('s.estado_validacion', $v);
        if ($v = $request->query('area_id')) $q->where('s.area_id', (int) $v);
        if ($v = $request->query('cobrador_id')) $q->where('s.cobrador_id', (int) $v);
        if ($v = $request->query('producto_id')) $q->where('s.producto_financiero_id', (int) $v);
        if ($v = $request->query('migracion_id')) $q->where('s.migracion_id', (int) $v);
        if ($v = $request->query('desde')) $q->whereDate('s.created_at', '>=', $v);
        if ($v = $request->query('hasta')) $q->whereDate('s.created_at', '<=', $v);
        if ($v = trim((string) $request->query('buscar'))) {
            $q->where(function ($w) use ($v) {
                $w->where('c.numero_documento', 'ILIKE', "%{$v}%")
                  ->orWhere('c.nombres', 'ILIKE', "%{$v}%")
                  ->orWhere('c.apellidos', 'ILIKE', "%{$v}%")
                  ->orWhere('s.numero_credito', 'ILIKE', "%{$v}%");
            });
        }

        $filas = $q->orderByRaw("CASE s.estado_validacion WHEN 'PENDIENTE' THEN 0 WHEN 'CORREGIDO' THEN 1 WHEN 'VALIDADO' THEN 2 ELSE 3 END")
            ->orderByDesc('s.id')
            ->limit(300)
            ->get([
                's.id', 's.numero_credito', 's.estado', 's.estado_validacion',
                's.saldo_migrado', 's.total_recaudar', 's.numero_cuotas', 's.modalidad',
                's.fecha_solicitud', 's.created_at', 's.migracion_id',
                'c.id as cliente_id', 'c.nombres', 'c.apellidos', 'c.numero_documento',
                'a.nombre as area', 'cob.nombre as cobrador', 'pf.nombre as producto',
                'imp.nombre as importador', 'm.nombre_archivo',
            ]);

        // Contadores para las fichas de la bandeja (respetando el alcance territorial)
        $base = DB::table('solicitudes')->whereNotNull('migracion_id');
        if ($areas !== null) $base->whereIn('area_id', $areas);
        $conteos = (clone $base)->selectRaw("estado_validacion, COUNT(*) as n")
            ->groupBy('estado_validacion')->pluck('n', 'estado_validacion');

        return response()->json(['data' => $filas, 'conteos' => $conteos]);
    }

    /** Catálogos para los filtros y la edición (según alcance del usuario). */
    public function opciones(Request $request)
    {
        $u = $request->user();
        $areas = $u->areasVisibles();
        return response()->json(['data' => [
            'areas' => DB::table('areas')->when($areas !== null, fn ($q) => $q->whereIn('id', $areas))
                            ->orderBy('nombre')->get(['id', 'nombre']),
            'cobradores' => DB::table('usuarios')->where('activo', true)
                            ->whereIn('rol', ['COBRADOR', 'SUPERVISOR'])->orderBy('nombre')->get(['id', 'nombre']),
            'productos' => DB::table('productos_financieros')->where('activo', true)->orderBy('orden')->get(['id', 'nombre']),
            'lotes' => DB::table('migraciones')->orderByDesc('id')->limit(30)->get(['id', 'nombre_archivo']),
        ]]);
    }

    /** Marcar VALIDADO (requiere 'migrados.validar'; la ruta ya lo exige). */
    public function validar(Request $request, int $id)
    {
        $s = $this->migradoDelAlcance($request, $id);

        if ($s->estado_validacion === 'BLOQUEADO') {
            return response()->json(['message' => 'Este crédito ya está bloqueado por tener movimientos; no requiere validación.'], 422);
        }

        DB::table('solicitudes')->where('id', $id)->update(['estado_validacion' => 'VALIDADO']);
        $this->auditar($request, $id, 'MIGRADO_VALIDADO',
            ['estado_validacion' => $s->estado_validacion], ['estado_validacion' => 'VALIDADO']);

        return response()->json(['message' => 'Crédito validado ✓']);
    }

    /**
     * EDICIÓN CONTROLADA (requiere 'migrados.editar').
     * Solo campos autorizados, con motivo obligatorio, trazabilidad campo a campo
     * (valor anterior / valor nuevo) y regeneración del cronograma si cambian el
     * saldo o el número de cuotas. Bloqueado = intocable.
     */
    public function editar(Request $request, int $id)
    {
        $s = $this->migradoDelAlcance($request, $id);

        if ($s->estado_validacion === 'BLOQUEADO') {
            return response()->json(['message' => 'Crédito bloqueado: ya tiene movimientos financieros y sus datos no son editables.'], 422);
        }
        if (DB::table('pagos')->where('solicitud_id', $id)->exists()) {
            // Defensa extra por si el bloqueo automático no alcanzó a marcarse
            \App\Services\MigracionService::bloquearSiMigrado($id, $request->user()->id, 'PAGO');
            return response()->json(['message' => 'Crédito con pagos registrados: quedó bloqueado y no es editable.'], 422);
        }

        $data = $request->validate([
            'motivo'                 => ['required', 'string', 'min:5', 'max:255'],
            'producto_financiero_id' => ['sometimes', 'integer', 'exists:productos_financieros,id'],
            'saldo_pendiente'        => ['sometimes', 'numeric', 'gt:0'],
            'valor_original'         => ['sometimes', 'numeric', 'gt:0'],
            'numero_cuotas'          => ['sometimes', 'integer', 'min:1', 'max:120'],
            'fecha_desembolso'       => ['sometimes', 'date'],
            'area_id'                => ['sometimes', 'integer', 'exists:areas,id'],
            'cobrador_id'            => ['sometimes', 'integer', 'exists:usuarios,id'],
            'modalidad'              => ['sometimes', 'in:DIARIO,SEMANAL,QUINCENAL,MENSUAL'],
        ]);

        $anteriores = [];
        $nuevos = [];
        $cambios = [];

        // Mapear a columnas reales de solicitudes
        $mapa = [
            'producto_financiero_id' => 'producto_financiero_id',
            'saldo_pendiente'        => 'total_recaudar',
            'valor_original'         => 'capital_solicitado',
            'numero_cuotas'          => 'numero_cuotas',
            'fecha_desembolso'       => 'fecha_solicitud',
            'area_id'                => 'area_id',
            'cobrador_id'            => 'cobrador_id',
            'modalidad'              => 'modalidad',
        ];
        foreach ($mapa as $campo => $col) {
            if (! array_key_exists($campo, $data)) continue;
            $anterior = $s->{$col};
            if ((string) $anterior === (string) $data[$campo]) continue;
            $anteriores[$campo] = $anterior;
            $nuevos[$campo] = $data[$campo];
            $cambios[$col] = $data[$campo];
        }

        if (! $cambios) {
            return response()->json(['message' => 'No hay cambios que aplicar.'], 422);
        }

        DB::transaction(function () use ($request, $id, $s, $data, $cambios, $anteriores, $nuevos) {
            // Si cambia el valor original, mantener coherencia con montos base
            if (isset($cambios['capital_solicitado'])) {
                $cambios['monto_aprobado'] = $cambios['capital_solicitado'];
                $cambios['monto_desembolsado'] = $cambios['capital_solicitado'];
            }

            // ¿Cambia el plan? → regenerar el cronograma (sin pagos, es seguro)
            $saldo = (float) ($cambios['total_recaudar'] ?? $s->total_recaudar);
            $nCuotas = (int) ($cambios['numero_cuotas'] ?? $s->numero_cuotas);
            $regenerar = isset($cambios['total_recaudar']) || isset($cambios['numero_cuotas']) || isset($cambios['modalidad']);

            if ($regenerar) {
                $modalidad = $cambios['modalidad'] ?? $s->modalidad;
                $valorCuota = round($saldo / max($nCuotas, 1), 2);
                $cambios['valor_cuota'] = $valorCuota;
                $cambios['total_financiado'] = $saldo;
                $cambios['saldo_migrado'] = $saldo;

                DB::table('cuotas')->where('solicitud_id', $id)->delete();
                $paso = match ($modalidad) {
                    'DIARIO' => '1 day', 'SEMANAL' => '1 week', 'QUINCENAL' => '15 days', default => '1 month',
                };
                $fecha = now();
                $acum = 0.0;
                $filas = [];
                for ($i = 1; $i <= $nCuotas; $i++) {
                    $fecha = $fecha->copy()->add(\Carbon\CarbonInterval::fromString($paso));
                    // Última cuota absorbe el redondeo para que la suma sea exacta
                    $valor = $i === $nCuotas ? round($saldo - $acum, 2) : $valorCuota;
                    $acum = round($acum + $valor, 2);
                    $filas[] = [
                        'solicitud_id' => $id, 'numero_cuota' => $i,
                        'fecha_vencimiento' => $fecha->toDateString(),
                        'valor' => $valor, 'valor_pagado' => 0, 'saldo' => $valor,
                        'estado' => 'PENDIENTE', 'created_at' => now(), 'updated_at' => now(),
                    ];
                }
                DB::table('cuotas')->insert($filas);
            }

            $cambios['estado_validacion'] = 'CORREGIDO';
            $cambios['updated_at'] = now();
            DB::table('solicitudes')->where('id', $id)->update($cambios);

            $this->auditar($request, $id, 'MIGRADO_CORREGIDO',
                $anteriores, $nuevos + ['motivo' => $data['motivo']]);
        });

        return response()->json(['message' => 'Crédito corregido ✓ (queda en estado CORREGIDO, listo para validar)']);
    }

    // ---------- helpers ----------

    /** Trae el crédito migrado verificando el alcance territorial del usuario. */
    private function migradoDelAlcance(Request $request, int $id): object
    {
        $s = DB::table('solicitudes')->where('id', $id)->whereNotNull('migracion_id')->first();
        abort_if(! $s, 404, 'El crédito no existe o no proviene de una migración.');

        $areas = $request->user()->areasVisibles();
        abort_if($areas !== null && ! in_array((int) $s->area_id, array_map('intval', (array) $areas), true),
            403, 'Este crédito no pertenece a tus áreas.');

        return $s;
    }

    private function auditar(Request $request, int $id, string $accion, array $antes, array $despues): void
    {
        DB::table('auditoria')->insert([
            'usuario_id'       => $request->user()->id,
            'accion'           => $accion,
            'entidad'          => 'solicitud',
            'entidad_id'       => $id,
            'datos_anteriores' => json_encode($antes, JSON_UNESCAPED_UNICODE),
            'datos_nuevos'     => json_encode($despues, JSON_UNESCAPED_UNICODE),
            'ip'               => $request->ip(),
            'user_agent'       => substr((string) $request->userAgent(), 0, 255),
            'created_at'       => now(),
        ]);
    }
}

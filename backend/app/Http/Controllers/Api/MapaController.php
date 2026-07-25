<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\SeguimientoService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class MapaController extends Controller
{
    /**
     * Reportar la ubicación del empleado (cada ~60s desde la app abierta).
     * La reporta el propio cobrador/supervisor; se guarda el historial del día
     * para dibujar el recorrido.
     */
    public function reportarUbicacion(Request $request, SeguimientoService $seguimiento)
    {
        $data = $request->validate([
            'latitud'     => ['required', 'numeric', 'between:-90,90'],
            'longitud'    => ['required', 'numeric', 'between:-180,180'],
            'precision_m' => ['nullable', 'numeric', 'gte:0'],
        ]);
        $u = $request->user();

        // Solo roles operativos reportan (el admin no anda en ruta)
        if (! in_array($u->rol, ['COBRADOR', 'SUPERVISOR'], true)) {
            return response()->json(['message' => 'ok'], 200);
        }

        // Último punto registrado (una sola consulta: usa idx_ubicacion_empleado_dia)
        $ultimo = DB::table('ubicaciones_empleado')
            ->where('empleado_id', $u->id)
            ->orderByDesc('reportada_at')
            ->first(['latitud', 'longitud', 'reportada_at']);

        // Filtros anti-ruido (intervalo mínimo y reposo sin desplazamiento)
        if (! $seguimiento->debeRegistrar($ultimo, (float) $data['latitud'], (float) $data['longitud'])) {
            return response()->json(['message' => 'ok'], 200);
        }

        DB::table('ubicaciones_empleado')->insert([
            'empleado_id' => $u->id,
            'latitud'     => $data['latitud'],
            'longitud'    => $data['longitud'],
            'precision_m' => $data['precision_m'] ?? null,
            'reportada_at'=> now(),
        ]);

        // Retención: depuración oportunista, una sola vez al día (ver servicio).
        $seguimiento->depurarUnaVezAlDia();

        return response()->json(['message' => 'ok'], 201);
    }

    /**
     * Cobradores en vivo: última posición + recorrido de HOY de cada empleado
     * operativo de las áreas visibles (modelo territorial). Admin ve todos;
     * supervisor, los de sus áreas.
     */
    public function cobradoresEnVivo(Request $request, SeguimientoService $seguimiento)
    {
        $u = $request->user();
        abort_unless($u->esAdministrador() || $u->esSupervisor(), 403, 'Sin acceso a la ubicación del equipo.');

        // Empleados visibles: operativos que comparten área con el usuario (o todos si admin)
        $areas = $u->areasVisibles();
        $empleados = DB::table('usuarios as e')
            ->where('e.activo', true)
            ->whereIn('e.rol', ['COBRADOR', 'SUPERVISOR'])
            ->where('e.id', '!=', $u->id)
            ->when($areas !== null, function ($q) use ($areas) {
                $q->whereIn('e.id', DB::table('usuario_area')->whereIn('area_id', $areas)->select('usuario_id'));
            })
            ->get(['e.id', 'e.nombre', 'e.rol']);

        if ($empleados->isEmpty()) {
            return response()->json(['data' => []]);
        }

        // UNA sola consulta para todos los empleados (antes: una por cada uno).
        // Se filtra por RANGO de fecha, no con whereDate(): aplicar una función sobre
        // la columna impide que PostgreSQL use idx_ubicacion_empleado_dia.
        $desde = now()->startOfDay();
        $puntos = DB::table('ubicaciones_empleado')
            ->whereIn('empleado_id', $empleados->pluck('id'))
            ->where('reportada_at', '>=', $desde)
            ->orderBy('empleado_id')->orderBy('reportada_at')
            ->get(['empleado_id', 'latitud', 'longitud', 'reportada_at'])
            ->groupBy('empleado_id');

        $ahora = now()->timestamp;
        $resultado = [];
        foreach ($empleados as $e) {
            $ruta = $puntos->get($e->id);
            if (! $ruta || $ruta->isEmpty()) continue;

            $ultimo = $ruta->last();
            $resultado[] = [
                'empleado_id' => $e->id,
                'nombre'      => $e->nombre,
                'rol'         => $e->rol,
                'ultima'      => [
                    'latitud'  => (float) $ultimo->latitud,
                    'longitud' => (float) $ultimo->longitud,
                    // Cálculo explícito por marca de tiempo: siempre positivo.
                    'hace_seg' => max(0, $ahora - \Illuminate\Support\Carbon::parse($ultimo->reportada_at)->timestamp),
                ],
                'puntos_totales' => $ruta->count(),
                // El recorrido se envía SIMPLIFICADO: una jornada puede acumular
                // cientos de puntos y el trazo se ve igual con ~120. Reduce el peso
                // de la respuesta y el trabajo de dibujado en el móvil.
                'recorrido'   => $seguimiento->simplificarRecorrido($ruta),
            ];
        }

        return response()->json(['data' => $resultado]);
    }

    /** Clientes georreferenciados con su estado de cartera, según el alcance del rol. */
    public function clientes(Request $request)
    {
        $u = $request->user();

        $q = DB::table('clientes as c')
            ->leftJoin('usuarios as uc', 'uc.id', '=', 'c.cobrador_id')
            ->leftJoin('areas as a', 'a.id', '=', 'c.area_id')
            ->whereNotNull('c.latitud')
            ->whereNotNull('c.longitud')
            ->where('c.activo', true);

        // Modelo territorial: el mapa operativo muestra la cartera del área del usuario.
        $areas = $u->areasVisibles();
        if ($areas !== null) {
            $q->whereIn('c.area_id', $areas);
        }

        $saldoSub = "(SELECT COALESCE(SUM(q.valor - q.valor_pagado),0)
            FROM cuotas q JOIN solicitudes s ON s.id = q.solicitud_id
            WHERE s.cliente_id = c.id AND q.estado IN ('PENDIENTE','PARCIAL','VENCIDA'))";

        $vencidoSub = "(SELECT COALESCE(SUM(q.valor - q.valor_pagado),0)
            FROM cuotas q JOIN solicitudes s ON s.id = q.solicitud_id
            WHERE s.cliente_id = c.id AND q.estado IN ('PENDIENTE','PARCIAL','VENCIDA')
              AND q.fecha_vencimiento < CURRENT_DATE)";

        $activosSub = "(SELECT COUNT(*) FROM solicitudes s
            WHERE s.cliente_id = c.id AND s.estado IN ('ACTIVO','DESEMBOLSADO','EN_MORA','MIGRADO'))";

        $filas = $q->orderBy('c.nombres')->get([
            'c.id',
            DB::raw("TRIM(c.nombres || ' ' || c.apellidos) as nombre"),
            'c.telefono_principal as telefono',
            'c.direccion', 'c.barrio',
            DB::raw('CAST(c.latitud AS FLOAT) as latitud'),
            DB::raw('CAST(c.longitud AS FLOAT) as longitud'),
            'uc.nombre as cobrador',
            'a.nombre as area',
            DB::raw("$saldoSub as saldo"),
            DB::raw("$vencidoSub as vencido"),
            DB::raw("$activosSub as creditos_activos"),
        ]);

        return response()->json(['data' => $filas]);
    }
}

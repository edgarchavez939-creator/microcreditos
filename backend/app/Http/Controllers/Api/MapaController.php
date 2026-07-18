<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class MapaController extends Controller
{
    /**
     * Reportar la ubicación del empleado (cada ~60s desde la app abierta).
     * La reporta el propio cobrador/supervisor; se guarda el historial del día
     * para dibujar el recorrido.
     */
    public function reportarUbicacion(Request $request)
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

        // Anti-ruido: máximo un punto cada 45 segundos por empleado
        $ultimo = DB::table('ubicaciones_empleado')->where('empleado_id', $u->id)->max('reportada_at');
        if ($ultimo && now()->diffInSeconds($ultimo) < 45) {
            return response()->json(['message' => 'ok'], 200);
        }

        DB::table('ubicaciones_empleado')->insert([
            'empleado_id' => $u->id,
            'latitud'     => $data['latitud'],
            'longitud'    => $data['longitud'],
            'precision_m' => $data['precision_m'] ?? null,
            'reportada_at'=> now(),
        ]);

        return response()->json(['message' => 'ok'], 201);
    }

    /**
     * Cobradores en vivo: última posición + recorrido de HOY de cada empleado
     * operativo de las áreas visibles (modelo territorial). Admin ve todos;
     * supervisor, los de sus áreas.
     */
    public function cobradoresEnVivo(Request $request)
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

        $hoy = now()->toDateString();
        $resultado = [];
        foreach ($empleados as $e) {
            $puntos = DB::table('ubicaciones_empleado')
                ->where('empleado_id', $e->id)
                ->whereDate('reportada_at', $hoy)
                ->orderBy('reportada_at')
                ->get(['latitud', 'longitud', 'reportada_at']);
            if ($puntos->isEmpty()) continue;

            $ultimo = $puntos->last();
            $resultado[] = [
                'empleado_id' => $e->id,
                'nombre'      => $e->nombre,
                'rol'         => $e->rol,
                'ultima'      => [
                    'latitud'  => (float) $ultimo->latitud,
                    'longitud' => (float) $ultimo->longitud,
                    'hace_seg' => (int) now()->diffInSeconds($ultimo->reportada_at),
                ],
                'recorrido'   => $puntos->map(fn ($p) => [(float) $p->latitud, (float) $p->longitud])->values(),
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
            WHERE s.cliente_id = c.id AND s.estado IN ('ACTIVO','DESEMBOLSADO','EN_MORA'))";

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

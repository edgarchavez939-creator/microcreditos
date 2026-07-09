<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class MapaController extends Controller
{
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

        if ($u->esCobrador()) {
            $q->where(fn ($x) => $x->where('c.cobrador_id', $u->id)->orWhere('c.created_by', $u->id));
        } elseif ($u->esSupervisor()) {
            $areas = $u->areas()->pluck('areas.id');
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

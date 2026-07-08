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

        $filas = $q->orderByRaw("CASE WHEN q.estado = 'VENCIDA' THEN 0 ELSE 1 END")
            ->orderBy('q.fecha_vencimiento')
            ->limit(300)
            ->get([
                'q.id as cuota_id', 'q.numero_cuota', 'q.fecha_vencimiento', 'q.estado',
                DB::raw('CAST(q.valor - q.valor_pagado AS FLOAT) as valor_pendiente'),
                'q.dias_mora',
                's.id as solicitud_id', 's.numero_credito',
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
                'cobros_hoy'   => ['cantidad' => $hoy->count(), 'total' => (float) $hoy->sum('valor_pendiente')],
                'en_mora'      => ['cantidad' => $vencidas->count(), 'total' => (float) $vencidas->sum('valor_pendiente')],
            ],
        ]);
    }

    /** 6) Resumen del día del usuario: lo recaudado hoy (para cerrar caja). */
    public function resumenDia(Request $request)
    {
        $u = $request->user();
        $hoy = now()->toDateString();

        $mov = DB::table('movimientos_caja')
            ->whereDate('fecha', $hoy)
            ->where('registrado_por', $u->id);

        $ingresos = (float) (clone $mov)->where('tipo', 'INGRESO')->sum('valor');
        $egresos  = (float) (clone $mov)->where('tipo', 'EGRESO')->sum('valor');
        $numPagos = (clone $mov)->where('tipo', 'INGRESO')->where('referencia_tipo', 'PAGO')->count();

        $cierre = CierreCaja::whereDate('fecha', $hoy)->where('cerrado_por', $u->id)->first();

        return response()->json(['data' => [
            'fecha'          => $hoy,
            'total_ingresos' => $ingresos,
            'total_egresos'  => $egresos,
            'saldo'          => round($ingresos - $egresos, 2),
            'numero_pagos'   => $numPagos,
            'ya_cerrada'     => (bool) $cierre,
            'cierre'         => $cierre,
        ]]);
    }

    /** 6) Cerrar la caja del día del usuario. */
    public function cerrar(Request $request)
    {
        $u = $request->user();
        $hoy = now()->toDateString();

        abort_if(
            CierreCaja::whereDate('fecha', $hoy)->where('cerrado_por', $u->id)->exists(),
            422, 'Ya cerraste la caja de hoy.'
        );

        $mov = DB::table('movimientos_caja')->whereDate('fecha', $hoy)->where('registrado_por', $u->id);
        $ingresos = (float) (clone $mov)->where('tipo', 'INGRESO')->sum('valor');
        $egresos  = (float) (clone $mov)->where('tipo', 'EGRESO')->sum('valor');

        $areaId = DB::table('usuario_area')->where('usuario_id', $u->id)->value('area_id');

        $cierre = CierreCaja::create([
            'fecha'          => $hoy,
            'area_id'        => $areaId,
            'total_ingresos' => $ingresos,
            'total_egresos'  => $egresos,
            'saldo'          => round($ingresos - $egresos, 2),
            'cerrado_por'    => $u->id,
        ]);

        return response()->json(['message' => 'Caja cerrada.', 'data' => $cierre], 201);
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

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

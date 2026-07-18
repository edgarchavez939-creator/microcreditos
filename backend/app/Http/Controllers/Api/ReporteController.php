<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Solicitud;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReporteController extends Controller
{
    /** Ids de solicitudes visibles según el rol (admin: todas; supervisor: sus áreas; cobrador: su cartera). */
    private function idsVisibles(Request $request)
    {
        $u = $request->user();
        $q = Solicitud::query();
        // Modelo territorial: filtrar por el área del CLIENTE (en vivo), no la del crédito.
        $areas = $u->areasVisibles();
        if ($areas !== null) {
            $q->whereIn('cliente_id',
                \Illuminate\Support\Facades\DB::table('clientes')->whereIn('area_id', $areas)->select('id'));
        }
        return $q->pluck('id');
    }

    /** Cartera: un renglón por crédito con saldos. */
    public function cartera(Request $request)
    {
        $ids = $this->idsVisibles($request);

        $filas = DB::table('solicitudes as s')
            ->join('clientes as c', 'c.id', '=', 's.cliente_id')
            ->leftJoin('usuarios as u', 'u.id', '=', 's.cobrador_id')
            ->leftJoin('areas as a', 'a.id', '=', 's.area_id')
            ->leftJoin('productos_financieros as pf', 'pf.id', '=', 's.producto_financiero_id')
            ->leftJoin('cuotas as q', 'q.solicitud_id', '=', 's.id')
            ->whereIn('s.id', $ids)
            ->whereIn('s.estado', ['ACTIVO', 'DESEMBOLSADO', 'EN_MORA', 'FINALIZADO'])
            ->groupBy('s.id', 's.numero_credito', 'c.nombres', 'c.apellidos', 'c.numero_documento',
                'u.nombre', 'a.nombre', 's.monto_aprobado', 's.total_recaudar', 's.estado', 's.modalidad',
                'pf.nombre', 'pf.codigo', 's.producto_version')
            ->orderBy('s.id')
            ->get([
                's.numero_credito',
                DB::raw("TRIM(c.nombres || ' ' || c.apellidos) as cliente"),
                'c.numero_documento as documento',
                'u.nombre as cobrador',
                DB::raw("COALESCE(pf.nombre, 'Crédito Tradicional') as producto"),
                DB::raw("COALESCE(pf.codigo, 'TRADICIONAL') as producto_codigo"),
                's.producto_version',
                'a.nombre as area',
                's.modalidad',
                's.monto_aprobado as capital',
                's.total_recaudar as total',
                DB::raw('COALESCE(SUM(q.valor_pagado),0) as pagado'),
                DB::raw('COALESCE(SUM(CASE WHEN q.estado IN (\'PENDIENTE\',\'PARCIAL\',\'VENCIDA\') THEN q.valor - q.valor_pagado ELSE 0 END),0) as saldo'),
                DB::raw('COALESCE(SUM(CASE WHEN q.fecha_vencimiento < CURRENT_DATE AND q.estado IN (\'PENDIENTE\',\'PARCIAL\',\'VENCIDA\') THEN q.valor - q.valor_pagado ELSE 0 END),0) as vencido'),
                's.estado',
            ]);

        return response()->json(['data' => $filas]);
    }

    /** Pagos en un rango de fechas. */
    public function pagos(Request $request)
    {
        $data = $request->validate([
            'desde' => ['required', 'date'],
            'hasta' => ['required', 'date', 'after_or_equal:desde'],
        ]);
        $ids = $this->idsVisibles($request);

        $filas = DB::table('pagos as p')
            ->join('solicitudes as s', 's.id', '=', 'p.solicitud_id')
            ->join('clientes as c', 'c.id', '=', 'p.cliente_id')
            ->leftJoin('usuarios as u', 'u.id', '=', DB::raw('COALESCE(p.collected_by, p.registrado_por)'))
            ->whereIn('p.solicitud_id', $ids)
            ->where('p.aplicado', true)
            ->whereBetween('p.fecha', [$data['desde'], $data['hasta']])
            ->orderBy('p.fecha')->orderBy('p.id')
            ->get([
                'p.fecha',
                's.numero_credito',
                DB::raw("TRIM(c.nombres || ' ' || c.apellidos) as cliente"),
                'p.valor',
                'p.metodo',
                'u.nombre as registrado_por',
                'p.observaciones',
            ]);

        return response()->json(['data' => $filas, 'total' => (float) $filas->sum('valor')]);
    }

    /** Mora: cuotas vencidas con días de atraso. */
    public function mora(Request $request)
    {
        $ids = $this->idsVisibles($request);

        $filas = DB::table('cuotas as q')
            ->join('solicitudes as s', 's.id', '=', 'q.solicitud_id')
            ->join('clientes as c', 'c.id', '=', 's.cliente_id')
            ->leftJoin('usuarios as u', 'u.id', '=', 's.cobrador_id')
            ->leftJoin('areas as a', 'a.id', '=', 's.area_id')
            ->whereIn('q.solicitud_id', $ids)
            ->whereDate('q.fecha_vencimiento', '<', now()->toDateString())
            ->whereIn('q.estado', ['PENDIENTE', 'PARCIAL', 'VENCIDA'])
            ->orderBy('q.fecha_vencimiento')
            ->get([
                's.numero_credito',
                DB::raw("TRIM(c.nombres || ' ' || c.apellidos) as cliente"),
                'c.telefono_principal as telefono',
                'u.nombre as cobrador',
                DB::raw("COALESCE(pf.nombre, 'Crédito Tradicional') as producto"),
                DB::raw("COALESCE(pf.codigo, 'TRADICIONAL') as producto_codigo"),
                's.producto_version',
                'a.nombre as area',
                'q.numero_cuota',
                'q.fecha_vencimiento',
                DB::raw('(q.valor - q.valor_pagado) as valor_pendiente'),
                DB::raw('(CURRENT_DATE - q.fecha_vencimiento) as dias_mora'),
            ]);

        return response()->json(['data' => $filas, 'total' => (float) $filas->sum('valor_pendiente')]);
    }

    /** Flujo de caja: movimientos entre fechas con totales. */
    public function caja(Request $request)
    {
        $data = $request->validate([
            'desde' => ['required', 'date'],
            'hasta' => ['required', 'date', 'after_or_equal:desde'],
        ]);
        $u = $request->user();

        $q = DB::table('movimientos_caja as m')
            ->leftJoin('usuarios as us', 'us.id', '=', 'm.registrado_por')
            ->leftJoin('areas as a', 'a.id', '=', 'm.area_id')
            ->whereBetween('m.fecha', [$data['desde'], $data['hasta']]);

        if ($u->esCobrador()) {
            $q->where('m.registrado_por', $u->id);
        } elseif ($u->esSupervisor()) {
            $areas = DB::table('usuario_area')->where('usuario_id', $u->id)->pluck('area_id');
            $q->whereIn('m.area_id', $areas);
        }

        $filas = $q->orderBy('m.fecha')->orderBy('m.id')->get([
            'm.fecha', 'm.tipo', 'm.concepto',
            DB::raw('CAST(m.valor AS FLOAT) as valor'),
            'a.nombre as area', 'us.nombre as registrado_por',
        ]);

        $ingresos = (float) $filas->where('tipo', 'INGRESO')->sum('valor');
        $egresos  = (float) $filas->where('tipo', 'EGRESO')->sum('valor');

        return response()->json([
            'data' => $filas,
            'total' => round($ingresos - $egresos, 2),
            'ingresos' => $ingresos,
            'egresos' => $egresos,
        ]);
    }

    /** Productividad por cobrador: recaudo, clientes, creditos y % de mora de su cartera. */
    public function productividad(Request $request)
    {
        $data = $request->validate([
            'desde' => ['required', 'date'],
            'hasta' => ['required', 'date', 'after_or_equal:desde'],
        ]);
        $u = $request->user();

        // Alcance: admin ve todos; supervisor ve cobradores de sus areas; cobrador solo a si mismo
        $cobradores = DB::table('usuarios')->where('rol', 'COBRADOR')->where('activo', true);
        if ($u->esSupervisor()) {
            $areas = DB::table('usuario_area')->where('usuario_id', $u->id)->pluck('area_id');
            $ids = DB::table('usuario_area')->whereIn('area_id', $areas)->pluck('usuario_id');
            $cobradores->whereIn('id', $ids);
        } elseif ($u->esCobrador()) {
            $cobradores->where('id', $u->id);
        }
        $cobradores = $cobradores->get(['id', 'nombre']);

        $filas = $cobradores->map(function ($c) use ($data) {
            // Creditos de su cartera
            $creditosIds = DB::table('solicitudes')
                ->where('cobrador_id', $c->id)
                ->whereIn('estado', ['ACTIVO', 'DESEMBOLSADO', 'EN_MORA', 'PAGADO'])
                ->pluck('id')->all();

            $recaudado = (float) DB::table('pagos')
                ->where(DB::raw('COALESCE(collected_by, registrado_por)'), $c->id)
                ->where('aplicado', true)
                ->whereBetween('fecha', [$data['desde'], $data['hasta']])
                ->sum('valor');

            $numPagos = (int) DB::table('pagos')
                ->where(DB::raw('COALESCE(collected_by, registrado_por)'), $c->id)
                ->where('aplicado', true)
                ->whereBetween('fecha', [$data['desde'], $data['hasta']])
                ->count();

            $clientes = (int) DB::table('clientes')->where('cobrador_id', $c->id)->where('activo', true)->count();

            // Si el cobrador no tiene creditos, evitar IN () y devolver ceros
            $saldoTotal = empty($creditosIds) ? 0.0 : (float) DB::table('cuotas')
                ->whereIn('solicitud_id', $creditosIds)
                ->whereIn('estado', ['PENDIENTE', 'PARCIAL', 'VENCIDA'])
                ->sum(DB::raw('valor - valor_pagado'));

            $saldoVencido = empty($creditosIds) ? 0.0 : (float) DB::table('cuotas')
                ->whereIn('solicitud_id', $creditosIds)
                ->where('estado', 'VENCIDA')
                ->sum(DB::raw('valor - valor_pagado'));

            $pctMora = $saldoTotal > 0 ? round($saldoVencido / $saldoTotal * 100, 1) : 0.0;

            return [
                'cobrador'       => $c->nombre,
                'clientes'       => $clientes,
                'creditos'       => count($creditosIds),
                'numero_pagos'   => $numPagos,
                'recaudado'      => $recaudado,
                'saldo_cartera'  => round($saldoTotal, 2),
                'saldo_vencido'  => round($saldoVencido, 2),
                'pct_mora'       => $pctMora,
            ];
        })->sortByDesc('recaudado')->values();

        return response()->json(['data' => $filas]);
    }
}

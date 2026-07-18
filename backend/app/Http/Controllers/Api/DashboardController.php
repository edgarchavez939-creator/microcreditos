<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Cuota;
use App\Models\Pago;
use App\Models\Solicitud;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    /**
     * Datos gerenciales exclusivos del ADMINISTRADOR para su dashboard estratégico:
     * ranking de recaudo por cobrador, descuadres del día, desembolsos del día,
     * y cajas pendientes de recibir. Complementa el índice general.
     */
    public function gerencial(Request $request)
    {
        $u = $request->user();
        abort_unless($u->esAdministrador(), 403, 'Solo administración.');

        $hoy = now()->toDateString();
        $inicioMes = now()->startOfMonth()->toDateString();

        // Ranking de cobradores por recaudo del mes (top 8)
        $ranking = DB::table('pagos as p')
            ->join('usuarios as u', 'u.id', '=', 'p.registrado_por')
            ->whereDate('p.created_at', '>=', $inicioMes)
            ->where('p.estado', 'APLICADO')
            ->whereIn('u.rol', ['COBRADOR', 'SUPERVISOR'])
            ->groupBy('u.id', 'u.nombre', 'u.rol')
            ->select('u.id', 'u.nombre', 'u.rol',
                DB::raw('SUM(p.valor) as recaudo'), DB::raw('COUNT(*) as pagos'))
            ->orderByDesc('recaudo')
            ->limit(8)
            ->get();

        // Desembolsos del día
        $desembolsosHoy = DB::table('solicitudes')
            ->whereDate('fecha_desembolso', $hoy)
            ->whereNotNull('monto_desembolsado')
            ->selectRaw('COUNT(*) as n, COALESCE(SUM(monto_desembolsado),0) as total')
            ->first();

        // Descuadres del día (faltantes en cierres de caja)
        $descuadresHoy = DB::table('cierres_caja')
            ->whereDate('fecha', $hoy)
            ->where('diferencia', '<', -0.009)
            ->selectRaw('COUNT(*) as n, COALESCE(SUM(ABS(diferencia)),0) as total')
            ->first();

        // Cajas pendientes de recibir (tesorería)
        $cajasPendientes = (int) DB::table('cierres_caja')
            ->whereDate('fecha', $hoy)
            ->where('estado', 'PENDIENTE_ENTREGA')
            ->count();

        // Obligaciones de empleados pendientes
        $obligacionesPend = DB::table('obligaciones_empleado')
            ->where('estado', 'PENDIENTE')
            ->selectRaw('COUNT(DISTINCT empleado_id) as empleados, COALESCE(SUM(saldo),0) as total')
            ->first();

        return response()->json(['data' => [
            'ranking' => $ranking->map(fn ($r) => [
                'nombre' => $r->nombre, 'rol' => $r->rol,
                'recaudo' => (float) $r->recaudo, 'pagos' => (int) $r->pagos,
            ]),
            'desembolsos_hoy' => ['cantidad' => (int) ($desembolsosHoy->n ?? 0), 'total' => (float) ($desembolsosHoy->total ?? 0)],
            'descuadres_hoy'  => ['cantidad' => (int) ($descuadresHoy->n ?? 0), 'total' => (float) ($descuadresHoy->total ?? 0)],
            'cajas_pendientes' => $cajasPendientes,
            'obligaciones_empleados' => ['empleados' => (int) ($obligacionesPend->empleados ?? 0), 'total' => (float) ($obligacionesPend->total ?? 0)],
        ]]);
    }

    public function index(Request $request, \App\Services\MoraService $mora)
    {
        return $this->indexReal($request, $mora);
    }

    private function indexReal(Request $request, \App\Services\MoraService $mora)
    {
        $mora->sincronizar();
        $u = $request->user();

        // Alcance por rol: ids de solicitudes visibles para el usuario
        $solicitudes = Solicitud::query();

        // Filtro por áreas seleccionadas (admin y supervisor; el supervisor solo dentro de las suyas)
        if ($areasParam = $request->query('areas')) {
            $seleccion = array_filter(array_map('intval', explode(',', $areasParam)));
            if (! empty($seleccion)) {
                if ($u->esSupervisor()) {
                    $propias = DB::table('usuario_area')->where('usuario_id', $u->id)->pluck('area_id')->all();
                    $seleccion = array_values(array_intersect($seleccion, $propias));
                }
                if (! $u->esCobrador() && ! empty($seleccion)) {
                    $solicitudes->whereIn('area_id', $seleccion);
                }
            }
        }

        // Modelo territorial: filtrar por el área del CLIENTE (en vivo).
        $areasVis = $u->areasVisibles();
        if ($areasVis !== null) {
            $solicitudes->whereIn('cliente_id',
                \Illuminate\Support\Facades\DB::table('clientes')->whereIn('area_id', $areasVis)->select('id'));
        }
        $ids = $solicitudes->pluck('id');

        $prestado = (float) Solicitud::whereIn('id', $ids)
            ->whereIn('estado', ['ACTIVO', 'DESEMBOLSADO', 'FINALIZADO'])
            ->sum('monto_aprobado');

        $porRecaudar = (float) Solicitud::whereIn('id', $ids)
            ->whereIn('estado', ['ACTIVO', 'DESEMBOLSADO'])
            ->sum('total_recaudar');

        $recuperado = (float) Pago::whereIn('solicitud_id', $ids)->where('aplicado', true)->sum('valor');

        $saldoEnCalle = (float) Cuota::whereIn('solicitud_id', $ids)
            ->whereIn('estado', ['PENDIENTE', 'PARCIAL', 'VENCIDA'])
            ->sum(DB::raw('valor - valor_pagado'));

        $hoy = now()->toDateString();

        $cobrosHoy = Cuota::whereIn('solicitud_id', $ids)
            ->whereDate('fecha_vencimiento', $hoy)
            ->whereIn('estado', ['PENDIENTE', 'PARCIAL'])
            ->selectRaw('COUNT(*) as n, COALESCE(SUM(valor - valor_pagado),0) as total')
            ->first();

        $vencidas = Cuota::whereIn('solicitud_id', $ids)
            ->whereDate('fecha_vencimiento', '<', $hoy)
            ->whereIn('estado', ['PENDIENTE', 'PARCIAL', 'VENCIDA'])
            ->selectRaw('COUNT(*) as n, COALESCE(SUM(valor - valor_pagado),0) as total')
            ->first();

        $recaudadoHoy = (float) Pago::whereIn('solicitud_id', $ids)->where('aplicado', true)->whereDate('fecha', $hoy)->sum('valor');

        $activos = (int) Solicitud::whereIn('id', $ids)->whereIn('estado', ['ACTIVO', 'DESEMBOLSADO'])->count();

        $pendientes = (int) Solicitud::whereIn('id', $ids)
            ->whereIn('estado', ['PENDIENTE_SUPERVISOR', 'PENDIENTE_ADMINISTRADOR'])
            ->count();

        $exoneraciones = (int) Solicitud::whereIn('id', $ids)
            ->where('estado', 'PENDIENTE_ADMINISTRADOR')
            ->where('seguro_exonerado', true)
            ->count();

        // ===== KPIs gerenciales (indicadores financieros de cartera) =====
        // Índice de mora: saldo vencido / saldo total en calle
        $indiceMora = $saldoEnCalle > 0
            ? round(((float) ($vencidas->total ?? 0)) / $saldoEnCalle * 100, 1) : 0.0;

        // Cartera en riesgo (CER >30): saldo de créditos con cuotas vencidas hace más de 30 días
        $carteraRiesgo = (float) Cuota::whereIn('solicitud_id', $ids)
            ->whereDate('fecha_vencimiento', '<', now()->subDays(30)->toDateString())
            ->whereIn('estado', ['PENDIENTE', 'PARCIAL', 'VENCIDA'])
            ->sum(DB::raw('valor - valor_pagado'));
        $pctCarteraRiesgo = $saldoEnCalle > 0 ? round($carteraRiesgo / $saldoEnCalle * 100, 1) : 0.0;

        // Tasa de recuperación: recaudado / total a recaudar de créditos colocados
        $totalColocado = (float) Solicitud::whereIn('id', $ids)
            ->whereIn('estado', ['ACTIVO', 'DESEMBOLSADO', 'PAGADO'])
            ->sum('total_recaudar');
        $tasaRecuperacion = $totalColocado > 0 ? round($recuperado / $totalColocado * 100, 1) : 0.0;

        // Promesas de pago vigentes (compromisos activos de la cobranza)
        $clienteIds = Solicitud::whereIn('id', $ids)->pluck('cliente_id')->unique();
        $promesasVigentes = (int) DB::table('gestiones_mora')
            ->whereIn('cliente_id', $clienteIds)
            ->where('tipo', 'ACUERDO_PAGO')
            ->whereDate('fecha_acuerdo', '>=', now()->toDateString())
            ->count();

        return response()->json(['data' => [
            'prestado'        => $prestado,
            'por_recaudar'    => $porRecaudar,
            'recuperado'      => $recuperado,
            'saldo_en_calle'  => $saldoEnCalle,
            'recaudado_hoy'   => $recaudadoHoy,
            'cobros_hoy'      => ['cantidad' => (int) ($cobrosHoy->n ?? 0), 'total' => (float) ($cobrosHoy->total ?? 0)],
            'mora'            => ['cantidad' => (int) ($vencidas->n ?? 0), 'total' => (float) ($vencidas->total ?? 0)],
            'creditos_activos'   => $activos,
            'pendientes_aprobacion' => $pendientes,
            'exoneraciones_pendientes' => $exoneraciones,
            'kpis' => [
                'indice_mora'        => $indiceMora,          // % del saldo en calle que está vencido
                'cartera_riesgo_30'  => $carteraRiesgo,       // $ con mora > 30 días
                'pct_cartera_riesgo' => $pctCarteraRiesgo,    // % del saldo en calle
                'tasa_recuperacion'  => $tasaRecuperacion,    // % recaudado de lo colocado
                'promesas_vigentes'  => $promesasVigentes,    // compromisos de pago activos
            ],
        ]]);
    }

    /** Ids de solicitudes visibles para el usuario, respetando rol y filtro de areas. */
    private function idsVisibles(Request $request): \Illuminate\Support\Collection
    {
        $u = $request->user();
        $solicitudes = Solicitud::query();

        if ($areasParam = $request->query('areas')) {
            $seleccion = array_filter(array_map('intval', explode(',', $areasParam)));
            if (! empty($seleccion)) {
                if ($u->esSupervisor()) {
                    $propias = DB::table('usuario_area')->where('usuario_id', $u->id)->pluck('area_id')->all();
                    $seleccion = array_values(array_intersect($seleccion, $propias));
                }
                if (! $u->esCobrador() && ! empty($seleccion)) {
                    $solicitudes->whereIn('area_id', $seleccion);
                }
            }
        }

        // Modelo territorial: filtrar por el área del CLIENTE (en vivo).
        $areasVis = $u->areasVisibles();
        if ($areasVis !== null) {
            $solicitudes->whereIn('cliente_id',
                \Illuminate\Support\Facades\DB::table('clientes')->whereIn('area_id', $areasVis)->select('id'));
        }

        return $solicitudes->pluck('id');
    }

    /** Series para las graficas del dashboard. */
    public function graficas(Request $request)
    {
        $ids = $this->idsVisibles($request);
        if ($ids->isEmpty()) {
            return response()->json(['data' => ['recaudo' => [], 'cartera_area' => [], 'mora' => []]]);
        }

        // 1) Evolucion del recaudo: ultimos 30 dias (pagos aplicados)
        $desde = now()->subDays(29)->toDateString();
        $recaudoRaw = DB::table('pagos')
            ->whereIn('solicitud_id', $ids)
            ->where('aplicado', true)
            ->whereDate('fecha', '>=', $desde)
            ->groupBy('fecha')
            ->orderBy('fecha')
            ->get([DB::raw('fecha::date as dia'), DB::raw('SUM(valor) as total')]);

        $mapa = $recaudoRaw->keyBy(fn ($r) => (string) $r->dia);
        $recaudo = [];
        for ($i = 0; $i < 30; $i++) {
            $d = now()->subDays(29 - $i)->toDateString();
            $recaudo[] = ['dia' => substr($d, 5), 'total' => (float) ($mapa[$d]->total ?? 0)];
        }

        // 2) Cartera por area: saldo pendiente agrupado por area
        $carteraArea = DB::table('cuotas as q')
            ->join('solicitudes as s', 's.id', '=', 'q.solicitud_id')
            ->leftJoin('areas as a', 'a.id', '=', 's.area_id')
            ->whereIn('s.id', $ids)
            ->whereIn('q.estado', ['PENDIENTE', 'PARCIAL', 'VENCIDA'])
            ->groupBy('a.nombre')
            ->orderByDesc(DB::raw('SUM(q.valor - q.valor_pagado)'))
            ->get([
                DB::raw("COALESCE(a.nombre, 'Sin area') as area"),
                DB::raw('CAST(SUM(q.valor - q.valor_pagado) AS FLOAT) as saldo'),
            ]);

        // 3) Mora por area: vencido vs al dia (barras apiladas)
        $mora = DB::table('cuotas as q')
            ->join('solicitudes as s', 's.id', '=', 'q.solicitud_id')
            ->leftJoin('areas as a', 'a.id', '=', 's.area_id')
            ->whereIn('s.id', $ids)
            ->whereIn('q.estado', ['PENDIENTE', 'PARCIAL', 'VENCIDA'])
            ->groupBy('a.nombre')
            ->get([
                DB::raw("COALESCE(a.nombre, 'Sin area') as area"),
                DB::raw("CAST(SUM(CASE WHEN q.estado = 'VENCIDA' THEN q.valor - q.valor_pagado ELSE 0 END) AS FLOAT) as vencido"),
                DB::raw("CAST(SUM(CASE WHEN q.estado <> 'VENCIDA' THEN q.valor - q.valor_pagado ELSE 0 END) AS FLOAT) as al_dia"),
            ]);

        return response()->json(['data' => [
            'recaudo'      => $recaudo,
            'cartera_area' => $carteraArea,
            'mora'         => $mora,
        ]]);
    }
}

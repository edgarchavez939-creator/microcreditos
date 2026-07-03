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
    public function index(Request $request, \App\Services\MoraService $mora)
    {
        $mora->sincronizar();
        $u = $request->user();

        // Alcance por rol: ids de solicitudes visibles para el usuario
        $solicitudes = Solicitud::query();
        if ($u->esCobrador()) {
            $solicitudes->where(fn ($q) => $q->where('cobrador_id', $u->id)->orWhere('created_by', $u->id));
        } elseif ($u->esSupervisor()) {
            $areas = $u->areas()->pluck('areas.id');
            $solicitudes->whereIn('area_id', $areas);
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
        ]]);
    }
}

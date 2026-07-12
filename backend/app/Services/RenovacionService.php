<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * Motor de scoring para renovación de créditos.
 *
 * Evalúa el comportamiento de pago real del cliente con variables propias
 * del negocio de microcrédito territorial:
 *  - Puntualidad: % de cuotas pagadas sin mora.
 *  - Severidad de mora: máximo de días de mora histórico.
 *  - Intensidad de cobranza: nº de gestiones de mora que requirió.
 *  - Experiencia: nº de créditos completados (PAGADO).
 *  - Estado del crédito actual: % pagado del crédito a renovar.
 *
 * El resultado es un score 0–100 y una recomendación de cupo basada en
 * parámetros configurables (sin valores rígidos en código).
 */
class RenovacionService
{
    /** Evalúa el scoring de renovación para un cliente y su crédito a renovar. */
    public function evaluar(int $clienteId, int $solicitudId): array
    {
        // --- 1) Puntualidad histórica: cuotas pagadas del cliente y cuántas sin mora ---
        $cuotas = DB::table('cuotas as q')
            ->join('solicitudes as s', 's.id', '=', 'q.solicitud_id')
            ->where('s.cliente_id', $clienteId)
            ->where('q.estado', 'PAGADA')
            ->selectRaw('COUNT(*) as total, SUM(CASE WHEN q.dias_mora = 0 THEN 1 ELSE 0 END) as puntuales, COALESCE(MAX(q.dias_mora),0) as max_mora')
            ->first();
        $totalPagadas = (int) ($cuotas->total ?? 0);
        $puntuales    = (int) ($cuotas->puntuales ?? 0);
        $maxMora      = (int) ($cuotas->max_mora ?? 0);
        $pctPuntualidad = $totalPagadas > 0 ? $puntuales / $totalPagadas : 0;

        // --- 2) Intensidad de cobranza: gestiones de mora registradas ---
        $gestiones = (int) DB::table('gestiones_mora')->where('cliente_id', $clienteId)->count();

        // --- 3) Experiencia: créditos completados ---
        $completados = (int) DB::table('solicitudes')->where('cliente_id', $clienteId)
            ->where('estado', 'PAGADO')->count();

        // --- 4) Crédito a renovar (base para el cupo sugerido) ---
        $credito = DB::table('solicitudes')->where('id', $solicitudId)->first();

        // --- Score ponderado (0–100) ---
        // Puntualidad 55% · Severidad de mora 20% · Cobranza 15% · Experiencia 10%
        // (El "avance" ya no puntúa: la renovación solo aplica a créditos PAGADOS,
        //  donde el avance es siempre 100% y no discrimina entre clientes.)
        $sPuntualidad = $pctPuntualidad * 55;
        $sMora  = max(0, 20 - min(20, $maxMora * (20 / 60)));       // 0 días=20 pts, 60+ días=0
        $sCobra = max(0, 15 - min(15, $gestiones * 3));             // cada gestión resta 3
        $sExp   = min(10, $completados * 5);                        // 2+ créditos completados = 10
        $score = (int) round($sPuntualidad + $sMora + $sCobra + $sExp);

        // --- Recomendación por umbrales configurables ---
        $umbralExcelente = (float) \App\Models\Parametro::valor('scoring.umbral_excelente', 80);
        $umbralBueno     = (float) \App\Models\Parametro::valor('scoring.umbral_bueno', 60);
        $umbralRegular   = (float) \App\Models\Parametro::valor('scoring.umbral_regular', 40);
        $aumentoMax      = (float) \App\Models\Parametro::valor('scoring.aumento_cupo', 0.30);
        $reduccion       = (float) \App\Models\Parametro::valor('cupo.reduccion_por_renovacion', 0.20);

        $montoBase = (float) ($credito->monto_aprobado ?? $credito->capital_solicitado ?? 0);
        if ($score >= $umbralExcelente) {
            $nivel = 'EXCELENTE';
            $cupoSugerido = round($montoBase * (1 + $aumentoMax), -3);
            $recomendacion = 'Renovar con aumento de cupo. Cliente con comportamiento sobresaliente.';
        } elseif ($score >= $umbralBueno) {
            $nivel = 'BUENO';
            $cupoSugerido = $montoBase;
            $recomendacion = 'Renovar por el mismo monto. Comportamiento de pago confiable.';
        } elseif ($score >= $umbralRegular) {
            $nivel = 'REGULAR';
            $cupoSugerido = round($montoBase * (1 - $reduccion), -3);
            $recomendacion = 'Renovar con cupo reducido y seguimiento cercano.';
        } else {
            $nivel = 'RIESGOSO';
            $cupoSugerido = 0;
            $recomendacion = 'No se recomienda renovar. Historial de pago deficiente.';
        }

        return [
            'score'  => $score,
            'nivel'  => $nivel,
            'recomendacion' => $recomendacion,
            'cupo_sugerido' => $cupoSugerido,
            'monto_credito_actual' => $montoBase,
            'variables' => [
                'cuotas_pagadas'   => $totalPagadas,
                'pct_puntualidad'  => round($pctPuntualidad * 100, 1),
                'max_dias_mora'    => $maxMora,
                'gestiones_mora'   => $gestiones,
                'creditos_completados' => $completados,
            ],
        ];
    }

    /** ¿El crédito es elegible para evaluación de renovación? */
    public function esElegible(object $credito): array
    {
        // Política del negocio: la renovación SOLO procede con créditos pagados
        // en su totalidad (estado PAGADO). No se renueva sobre saldo pendiente.
        if ($credito->estado === 'PAGADO') {
            return ['elegible' => true, 'motivo' => null];
        }
        return [
            'elegible' => false,
            'motivo'   => 'La renovación solo está disponible para créditos pagados en su totalidad.',
        ];
    }
}

<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

class CajaService
{
    /** Tipos de gasto permitidos. */
    public const TIPOS_GASTO = [
        'ALIMENTACION', 'COMBUSTIBLE', 'PARQUEADERO', 'PEAJES',
        'VEHICULO', 'PAPELERIA', 'OTROS',
    ];

    /**
     * Construye el estado consolidado de la caja del día para un usuario.
     * No escribe nada; solo lee y calcula. Es la fuente de verdad del resumen y del cierre.
     */
    public function estadoDia(int $usuarioId, ?string $fecha = null): array
    {
        $fecha = $fecha ?: now()->toDateString();

        // --- Base inicial (movimiento propio, registrado una vez) ---
        $baseInicial = (float) DB::table('movimientos_caja')
            ->whereDate('fecha', $fecha)->where('registrado_por', $usuarioId)
            ->where('referencia_tipo', 'BASE_INICIAL')->sum('valor');

        // --- Cobros del día (pagos aplicados), discriminados por medio ---
        $cobros = DB::table('movimientos_caja')
            ->whereDate('fecha', $fecha)->where('registrado_por', $usuarioId)
            ->where('tipo', 'INGRESO')->where('referencia_tipo', 'PAGO');

        $cobrosEfectivo = (float) (clone $cobros)->where('medio_pago', 'EFECTIVO')->sum('valor');
        $cobrosTransfer = (float) (clone $cobros)->where('medio_pago', '!=', 'EFECTIVO')->sum('valor');
        $numCobros      = (clone $cobros)->count();

        // --- Recaudo por seguros: suma del valor_seguro de los créditos DESEMBOLSADOS hoy ---
        $seguros = DB::table('desembolsos as d')
            ->join('solicitudes as s', 's.id', '=', 'd.solicitud_id')
            ->whereDate('d.fecha', $fecha)
            ->where('d.registrado_por', $usuarioId)
            ->selectRaw('COALESCE(SUM(s.valor_seguro),0) as total, COUNT(*) as num')
            ->first();
        $recaudoSeguros = (float) ($seguros->total ?? 0);
        $numSeguros     = (int) ($seguros->num ?? 0);

        // --- Desembolsos entregados hoy (egreso de efectivo cuando el método es efectivo) ---
        $desembolsos = DB::table('desembolsos')
            ->whereDate('fecha', $fecha)->where('registrado_por', $usuarioId);
        $totalDesembolsos       = (float) (clone $desembolsos)->sum('valor');
        $desembolsosEfectivo    = (float) (clone $desembolsos)->where('metodo', 'EFECTIVO')->sum('valor');

        // --- Gastos del día, por medio de pago ---
        $gastos = DB::table('movimientos_caja')
            ->whereDate('fecha', $fecha)->where('registrado_por', $usuarioId)
            ->where('referencia_tipo', 'GASTO');
        $totalGastos    = (float) (clone $gastos)->sum('valor');
        $gastosEfectivo = (float) (clone $gastos)->where('medio_pago', 'EFECTIVO')->sum('valor');

        // --- Saldo del día (movimiento total, incluye transferencias) ---
        // Base + cobros(todos) + seguros - desembolsos(todos) - gastos(todos)
        $saldoFinal = round(
            $baseInicial + $cobrosEfectivo + $cobrosTransfer + $recaudoSeguros
            - $totalDesembolsos - $totalGastos, 2
        );

        // --- Efectivo esperado en caja (SOLO físico) ---
        // Base + cobros EFECTIVO + seguros - desembolsos EFECTIVO - gastos EFECTIVO
        // (los seguros se retienen del desembolso, por eso suman al efectivo disponible)
        $efectivoEsperado = round(
            $baseInicial + $cobrosEfectivo + $recaudoSeguros
            - $desembolsosEfectivo - $gastosEfectivo, 2
        );

        $movimientoTotal = round(
            $baseInicial + $cobrosEfectivo + $cobrosTransfer + $recaudoSeguros
            + $totalDesembolsos + $totalGastos, 2
        );

        // Hora de apertura = primer movimiento del día
        $horaApertura = DB::table('movimientos_caja')
            ->whereDate('fecha', $fecha)->where('registrado_por', $usuarioId)
            ->min('created_at');

        return [
            'fecha'                => $fecha,
            'base_inicial'         => $baseInicial,
            'cobros_efectivo'      => $cobrosEfectivo,
            'cobros_transferencia' => $cobrosTransfer,
            'total_cobros'         => round($cobrosEfectivo + $cobrosTransfer, 2),
            'numero_cobros'        => $numCobros,
            'recaudo_seguros'      => $recaudoSeguros,
            'numero_seguros'       => $numSeguros,
            'total_desembolsos'    => $totalDesembolsos,
            'desembolsos_efectivo' => $desembolsosEfectivo,
            'total_gastos'         => $totalGastos,
            'gastos_efectivo'      => $gastosEfectivo,
            'saldo_final'          => $saldoFinal,
            'efectivo_esperado'    => $efectivoEsperado,
            'movimiento_total'     => $movimientoTotal,
            'hora_apertura'        => $horaApertura,
            'tiene_base'           => $baseInicial > 0,
        ];
    }

    /** Lista los movimientos del día (para la línea de tiempo de la jornada). */
    public function movimientosDia(int $usuarioId, ?string $fecha = null)
    {
        $fecha = $fecha ?: now()->toDateString();
        return DB::table('movimientos_caja')
            ->whereDate('fecha', $fecha)->where('registrado_por', $usuarioId)
            ->orderBy('created_at')
            ->get(['id', 'tipo', 'concepto', 'subtipo', 'valor', 'medio_pago',
                   'referencia_tipo', 'referencia_id', 'observacion', 'created_at']);
    }
}

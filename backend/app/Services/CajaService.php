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

        // --- Recaudo por seguros: suma del valor_seguro de los créditos DESEMBOLSADOS hoy.
        // PROPIEDAD: pertenece a quien CREÓ la solicitud (gestión comercial), NO a quien
        // aprueba ni a quien desembolsa. Por eso se filtra por s.created_by, no por
        // d.registrado_por. El desembolso pudo hacerlo otro usuario, pero el seguro
        // Se cruza con el MOVIMIENTO de caja del desembolso (fecha de hoy consistente),
        // y el valor_seguro se atribuye a quien creó la solicitud (gestión comercial).
        $seguros = DB::table('movimientos_caja as mc')
            ->join('solicitudes as s', 's.id', '=', 'mc.referencia_id')
            ->whereDate('mc.fecha', $fecha)
            ->where('mc.referencia_tipo', 'DESEMBOLSO')
            ->where('s.created_by', $usuarioId)
            ->selectRaw('COALESCE(SUM(s.valor_seguro),0) as total, COUNT(*) as num')
            ->first();
        $recaudoSeguros = (float) ($seguros->total ?? 0);
        $numSeguros     = (int) ($seguros->num ?? 0);

        // --- Desembolsos entregados hoy (egreso de efectivo cuando el método es efectivo) ---
        // --- Desembolsos entregados hoy: se leen desde movimientos_caja (fuente única
        // de la caja), NO desde la tabla desembolsos. Así el medio_pago y la fecha del
        // movimiento son consistentes con el resto de la caja. Un desembolso en efectivo
        // reduce el efectivo esperado; uno por transferencia solo afecta el movimiento total.
        $desembolsos = DB::table('movimientos_caja')
            ->whereDate('fecha', $fecha)->where('registrado_por', $usuarioId)
            ->where('referencia_tipo', 'DESEMBOLSO');
        $totalDesembolsos    = (float) (clone $desembolsos)->sum('valor');
        $desembolsosEfectivo = (float) (clone $desembolsos)->where('medio_pago', 'EFECTIVO')->sum('valor');

        // --- Gastos del día, por medio de pago ---
        $gastos = DB::table('movimientos_caja')
            ->whereDate('fecha', $fecha)->where('registrado_por', $usuarioId)
            ->where('referencia_tipo', 'GASTO');
        $totalGastos    = (float) (clone $gastos)->sum('valor');
        $gastosEfectivo = (float) (clone $gastos)->where('medio_pago', 'EFECTIVO')->sum('valor');

        // --- Saldo económico del día (incluye el recaudo comercial de seguros) ---
        $saldoFinal = round(
            $baseInicial + $cobrosEfectivo + $cobrosTransfer + $recaudoSeguros
            - $totalDesembolsos - $totalGastos, 2
        );

        // --- Efectivo esperado en caja (SOLO dinero físico que pasó por este usuario) ---
        // Base + cobros EFECTIVO − desembolsos EFECTIVO − gastos EFECTIVO.
        // NOTA: el recaudo por seguros NO entra aquí. El seguro se retiene dentro del
        // desembolso (dinero que maneja quien desembolsa), mientras que su reconocimiento
        // comercial pertenece a quien creó la solicitud —que puede ser otro usuario—.
        // Mezclarlo distorsionaría el arqueo físico. Se reporta aparte como indicador.
        $efectivoEsperado = round(
            $baseInicial + $cobrosEfectivo
            - $desembolsosEfectivo - $gastosEfectivo, 2
        );

        $movimientoTotal = round(
            $baseInicial + $cobrosEfectivo + $cobrosTransfer + $recaudoSeguros
            + $totalDesembolsos + $totalGastos, 2
        );

        // Hora de apertura = primer movimiento del día; abierto_por = quien registró la base
        $apertura = DB::table('movimientos_caja')
            ->whereDate('fecha', $fecha)->where('registrado_por', $usuarioId)
            ->orderBy('created_at')->first(['created_at', 'registrado_por']);
        $horaApertura = $apertura->created_at ?? null;

        $numDesembolsos = (int) (clone $desembolsos)->count();
        $numGastos = (int) DB::table('movimientos_caja')
            ->whereDate('fecha', $fecha)->where('registrado_por', $usuarioId)
            ->where('referencia_tipo', 'GASTO')->count();

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
            'numero_desembolsos'   => $numDesembolsos,
            'total_gastos'         => $totalGastos,
            'gastos_efectivo'      => $gastosEfectivo,
            'numero_gastos'        => $numGastos,
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

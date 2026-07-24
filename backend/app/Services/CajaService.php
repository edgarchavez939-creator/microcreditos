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

        // --- Reposiciones de efectivo entregadas durante la jornada ---
        // La empresa puede entregar más efectivo al cobrador mientras la caja está
        // abierta. Suman al efectivo disponible igual que la base inicial.
        $reposicionesQ = DB::table('movimientos_caja')
            ->whereDate('fecha', $fecha)->where('registrado_por', $usuarioId)
            ->where('referencia_tipo', 'REPOSICION');
        $reposiciones    = (float) (clone $reposicionesQ)->sum('valor');
        $numReposiciones = (int) (clone $reposicionesQ)->count();

        // --- Cobros del día (pagos aplicados), discriminados por medio ---
        $cobros = DB::table('movimientos_caja')
            ->whereDate('fecha', $fecha)->where('registrado_por', $usuarioId)
            ->where('tipo', 'INGRESO')->where('referencia_tipo', 'PAGO');

        $cobrosEfectivo = (float) (clone $cobros)->where('medio_pago', 'EFECTIVO')->sum('valor');
        $cobrosTransfer = (float) (clone $cobros)->where('medio_pago', '!=', 'EFECTIVO')->sum('valor');
        $numCobros      = (clone $cobros)->count();

        // --- Recaudo por seguros: valor_seguro de los créditos DESEMBOLSADOS hoy.
        // ATRIBUCIÓN: pertenece a QUIEN REALIZA EL DESEMBOLSO y a la caja del día en que
        // este ocurre (mc.registrado_por / mc.fecha), no a quien creó la solicitud ni a
        // la fecha de aprobación. Un crédito aprobado el lunes y desembolsado el jueves
        // recauda su seguro el jueves, en la caja de quien lo desembolsó.
        // NOTA CONTABLE: es un indicador comercial, NO entra al efectivo esperado, porque
        // el seguro se descuenta del monto entregado (la empresa repone el neto) y por
        // tanto nunca pasa físicamente por las manos del cobrador.
        $seguros = DB::table('movimientos_caja as mc')
            ->join('solicitudes as s', 's.id', '=', 'mc.referencia_id')
            ->whereDate('mc.fecha', $fecha)
            ->where('mc.referencia_tipo', 'DESEMBOLSO')
            ->where('mc.registrado_por', $usuarioId)
            // REVERSIÓN AUTOMÁTICA: si el desembolso fue anulado, su seguro deja de
            // recaudarse. Los cierres ya guardados conservan su fotografía original.
            ->whereNotExists(function ($q) {
                $q->select(DB::raw(1))->from('desembolsos as dd')
                  ->whereColumn('dd.solicitud_id', 'mc.referencia_id')
                  ->whereNotNull('dd.anulado_at');
            })
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
        $desembolsosTransfer = (float) (clone $desembolsos)->where('medio_pago', '!=', 'EFECTIVO')->sum('valor');

        // --- Anulaciones de desembolso: devuelven el efectivo a la caja (movimiento inverso) ---
        $anulacionesQ = DB::table('movimientos_caja')
            ->whereDate('fecha', $fecha)->where('registrado_por', $usuarioId)
            ->where('referencia_tipo', 'ANULACION_DESEMBOLSO');
        $anulaciones         = (float) (clone $anulacionesQ)->sum('valor');
        $anulacionesEfectivo = (float) (clone $anulacionesQ)->where('medio_pago', 'EFECTIVO')->sum('valor');

        // --- Gastos del día, por medio de pago ---
        $gastos = DB::table('movimientos_caja')
            ->whereDate('fecha', $fecha)->where('registrado_por', $usuarioId)
            ->where('referencia_tipo', 'GASTO');
        $totalGastos    = (float) (clone $gastos)->sum('valor');
        $gastosEfectivo = (float) (clone $gastos)->where('medio_pago', 'EFECTIVO')->sum('valor');

        // --- Saldo económico del día (incluye el recaudo comercial de seguros) ---
        $saldoFinal = round(
            $baseInicial + $reposiciones + $cobrosEfectivo + $cobrosTransfer + $recaudoSeguros
            - $totalDesembolsos + $anulaciones - $totalGastos, 2
        );

        // --- EFECTIVO ESPERADO: solo dinero FÍSICO que pasó por las manos del usuario ---
        //   + Base inicial
        //   + Reposiciones de efectivo recibidas durante el día
        //   + Cobros en EFECTIVO
        //   + Anulaciones de desembolso en efectivo (dinero que vuelve a la caja)
        //   − Desembolsos en EFECTIVO
        //   − Gastos en EFECTIVO
        //
        // NO se incluyen (decisión contable deliberada):
        //   · Cobros por TRANSFERENCIA: el dinero va al banco, no a la mano del cobrador.
        //     Sumarlos exigiría en el arqueo un efectivo que nunca recibió.
        //   · Recaudo por SEGUROS: la empresa repone el NETO del desembolso, así que el
        //     seguro nunca pasa por sus manos. Sumarlo generaría un sobrante falso.
        // Ambos se muestran en el resumen del día como información, no como efectivo.
        $efectivoEsperado = round(
            $baseInicial + $reposiciones + $cobrosEfectivo + $anulacionesEfectivo
            - $desembolsosEfectivo - $gastosEfectivo, 2
        );

        $movimientoTotal = round(
            $baseInicial + $reposiciones + $cobrosEfectivo + $cobrosTransfer + $recaudoSeguros
            + $totalDesembolsos + $totalGastos + $anulaciones, 2
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
            'reposiciones'         => $reposiciones,
            'numero_reposiciones'  => $numReposiciones,
            'cobros_efectivo'      => $cobrosEfectivo,
            'cobros_transferencia' => $cobrosTransfer,
            'total_cobros'         => round($cobrosEfectivo + $cobrosTransfer, 2),
            'numero_cobros'        => $numCobros,
            'recaudo_seguros'      => $recaudoSeguros,
            'numero_seguros'       => $numSeguros,
            'total_desembolsos'    => $totalDesembolsos,
            'desembolsos_efectivo' => $desembolsosEfectivo,
            'desembolsos_transferencia' => $desembolsosTransfer,
            'anulaciones'          => $anulaciones,
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

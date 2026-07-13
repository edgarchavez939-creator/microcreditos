<?php

namespace App\Services;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * ESTADO DE CUENTA DEL EMPLEADO — servicio central (ledger).
 *
 * Punto único que gobierna todas las obligaciones y movimientos financieros del
 * colaborador. Cualquier concepto (descuadre, préstamo, y futuros) se registra
 * con los mismos métodos: no hay lógica duplicada por concepto.
 *
 * Invariante contable: saldo de la obligación = monto_original − Σ abonos.
 * Cada movimiento registra el saldo resultante (extracto inmutable, nunca se borra).
 */
class EstadoCuentaService
{
    /**
     * Crea una obligación (cargo) y su movimiento de apertura.
     * @param string $tipo DESCUADRE_CAJA | PRESTAMO_INTERNO | ...
     */
    public function crearObligacion(
        int $empleadoId, string $tipo, string $concepto, float $monto,
        ?Request $request = null, ?string $observaciones = null,
        ?string $periodoDesde = null, ?string $periodoHasta = null
    ): int {
        return DB::transaction(function () use ($empleadoId, $tipo, $concepto, $monto, $request, $observaciones, $periodoDesde, $periodoHasta) {
            $id = DB::table('obligaciones_empleado')->insertGetId([
                'empleado_id'    => $empleadoId,
                'tipo'           => $tipo,
                'concepto'       => $concepto,
                'observaciones'  => $observaciones,
                'monto_original' => $monto,
                'saldo'          => $monto,
                'estado'         => 'PENDIENTE',
                'periodo_desde'  => $periodoDesde,
                'periodo_hasta'  => $periodoHasta,
                'creado_por'     => $request?->user()?->id,
                'created_at'     => now(),
                'updated_at'     => now(),
            ]);

            // Movimiento de apertura (CARGO / débito)
            DB::table('movimientos_empleado')->insert([
                'empleado_id'     => $empleadoId,
                'obligacion_id'   => $id,
                'tipo'            => 'CARGO',
                'concepto'        => $concepto,
                'debito'          => $monto,
                'credito'         => 0,
                'saldo_obligacion'=> $monto,
                'observaciones'   => $observaciones,
                'registrado_por'  => $request?->user()?->id,
                'ip'              => $request?->ip(),
                'user_agent'      => $request?->userAgent(),
                'created_at'      => now(),
            ]);

            $this->auditar($request, 'OBLIGACION_CREADA', $empleadoId, $id, [
                'tipo' => $tipo, 'concepto' => $concepto, 'monto' => $monto,
                'saldo_anterior' => 0, 'saldo_nuevo' => $monto,
            ]);

            return $id;
        });
    }

    /**
     * Registra un abono (crédito) a una obligación. Monto libre; sin intereses ni mora.
     * Al llegar a saldo 0, la obligación pasa a PAGADO automáticamente.
     */
    public function abonar(int $obligacionId, float $monto, ?Request $request = null, ?string $observaciones = null): array
    {
        return DB::transaction(function () use ($obligacionId, $monto, $request, $observaciones) {
            $ob = DB::table('obligaciones_empleado')->where('id', $obligacionId)->lockForUpdate()->first();
            abort_unless($ob, 404, 'Obligación no encontrada.');
            abort_if($ob->estado === 'PAGADO', 422, 'Esta obligación ya está pagada.');
            abort_if($monto <= 0, 422, 'El abono debe ser mayor que cero.');
            abort_if($monto > (float) $ob->saldo + 0.001, 422, 'El abono no puede superar el saldo pendiente.');

            $saldoAnterior = (float) $ob->saldo;
            $saldoNuevo    = round($saldoAnterior - $monto, 2);
            $estado        = $saldoNuevo <= 0.001 ? 'PAGADO' : 'PENDIENTE';

            DB::table('obligaciones_empleado')->where('id', $obligacionId)->update([
                'saldo'      => $saldoNuevo,
                'estado'     => $estado,
                'updated_at' => now(),
            ]);

            DB::table('movimientos_empleado')->insert([
                'empleado_id'     => $ob->empleado_id,
                'obligacion_id'   => $obligacionId,
                'tipo'            => 'ABONO',
                'concepto'        => 'Abono a ' . $ob->concepto,
                'debito'          => 0,
                'credito'         => $monto,
                'saldo_obligacion'=> $saldoNuevo,
                'observaciones'   => $observaciones,
                'registrado_por'  => $request?->user()?->id,
                'ip'              => $request?->ip(),
                'user_agent'      => $request?->userAgent(),
                'created_at'      => now(),
            ]);

            $this->auditar($request, 'ABONO_REGISTRADO', $ob->empleado_id, $obligacionId, [
                'monto' => $monto, 'saldo_anterior' => $saldoAnterior, 'saldo_nuevo' => $saldoNuevo,
                'estado' => $estado,
            ]);

            return ['saldo' => $saldoNuevo, 'estado' => $estado];
        });
    }

    /**
     * Consolida los descuadres (faltantes) de la semana de un empleado en una sola
     * obligación. Período: lunes → sábado. Idempotente: solo toma los cierres con
     * faltante aún no liquidados, y los marca al trasladarlos.
     */
    public function consolidarDescuadresSemana(int $empleadoId, ?Request $request = null): ?int
    {
        $inicioSemana = now()->startOfWeek();               // lunes
        $finSemana    = now()->startOfWeek()->addDays(5)->endOfDay(); // sábado

        return DB::transaction(function () use ($empleadoId, $inicioSemana, $finSemana, $request) {
            $cierres = DB::table('cierres_caja')
                ->where('cerrado_por', $empleadoId)
                ->whereBetween('fecha', [$inicioSemana->toDateString(), $finSemana->toDateString()])
                ->where('diferencia', '<', -0.009)          // solo faltantes
                ->where('descuadre_liquidado', false)
                ->lockForUpdate()
                ->get(['id', 'fecha', 'diferencia']);

            if ($cierres->isEmpty()) return null;

            // El faltante es negativo; la deuda es su valor absoluto
            $total = round($cierres->sum(fn ($c) => abs((float) $c->diferencia)), 2);
            if ($total <= 0) return null;

            $concepto = 'Descuadre de caja semana ' . $inicioSemana->format('d/m') . ' al ' . $finSemana->format('d/m/Y');
            $obligacionId = $this->crearObligacion(
                $empleadoId, 'DESCUADRE_CAJA', $concepto, $total, $request,
                $cierres->count() . ' cierre(s) con faltante.',
                $inicioSemana->toDateString(), $finSemana->toDateString()
            );

            // Marcar los cierres como ya trasladados (no se vuelven a acumular)
            DB::table('cierres_caja')->whereIn('id', $cierres->pluck('id'))
                ->update(['descuadre_liquidado' => true]);

            return $obligacionId;
        });
    }

    /** Resumen (indicadores) del estado de cuenta de un empleado. */
    public function resumen(int $empleadoId): array
    {
        $obligaciones = DB::table('obligaciones_empleado')->where('empleado_id', $empleadoId);

        $porTipo = (clone $obligaciones)->where('estado', 'PENDIENTE')
            ->select('tipo', DB::raw('SUM(saldo) as saldo'))->groupBy('tipo')->pluck('saldo', 'tipo');

        $totalPagado = (float) DB::table('movimientos_empleado')
            ->where('empleado_id', $empleadoId)->where('tipo', 'ABONO')->sum('credito');

        $ultimoPago = DB::table('movimientos_empleado')
            ->where('empleado_id', $empleadoId)->where('tipo', 'ABONO')
            ->orderByDesc('created_at')->first(['credito', 'created_at']);

        $ultimoMovimiento = DB::table('movimientos_empleado')
            ->where('empleado_id', $empleadoId)->max('created_at');

        return [
            'saldo_total'          => round((float) (clone $obligaciones)->where('estado', 'PENDIENTE')->sum('saldo'), 2),
            'saldo_descuadres'     => round((float) ($porTipo['DESCUADRE_CAJA'] ?? 0), 2),
            'saldo_prestamos'      => round((float) ($porTipo['PRESTAMO_INTERNO'] ?? 0), 2),
            'total_pagado'         => round($totalPagado, 2),
            'ultimo_pago'          => $ultimoPago ? ['valor' => (float) $ultimoPago->credito, 'fecha' => $ultimoPago->created_at] : null,
            'obligaciones_activas' => (int) (clone $obligaciones)->where('estado', 'PENDIENTE')->count(),
            'obligaciones_pagadas' => (int) (clone $obligaciones)->where('estado', 'PAGADO')->count(),
            'ultimo_movimiento'    => $ultimoMovimiento,
        ];
    }

    private function auditar(?Request $request, string $accion, int $empleadoId, int $obligacionId, array $datos): void
    {
        DB::table('auditoria')->insert([
            'usuario_id'   => $request?->user()?->id,
            'accion'       => $accion,
            'entidad'      => 'estado_cuenta_empleado',
            'entidad_id'   => $obligacionId,
            'datos_nuevos' => json_encode(array_merge(['empleado_id' => $empleadoId], $datos), JSON_UNESCAPED_UNICODE),
            'ip'           => $request?->ip(),
            'user_agent'   => $request?->userAgent(),
            'created_at'   => now(),
        ]);
    }
}

<?php

namespace App\Services;

use App\Enums\EstadoSolicitud;
use App\Models\Cuota;
use App\Models\Parametro;
use App\Models\Solicitud;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * Reglas de negocio financiero de préstamos/ventas financiadas.
 *
 * Fórmulas (especificación):
 *   valor_seguro        = monto_aprobado * porcentaje_seguro
 *   monto_desembolsado  = monto_aprobado - valor_seguro
 *   total_recaudar      = monto_aprobado + intereses
 *   Los intereses SIEMPRE se calculan sobre monto_aprobado, nunca sobre el desembolsado.
 */
class LoanService
{
    /**
     * Calcula y persiste los montos derivados de una solicitud aplicando
     * las reglas de seguro y exoneración. Devuelve la solicitud actualizada.
     *
     * @param array{
     *   monto_aprobado: float, tasa_interes: float, numero_cuotas: int,
     *   porcentaje_seguro: float, seguro_exonerado: bool,
     *   motivo_exoneracion?: ?string, modalidad: string, fecha_primer_pago?: ?string
     * } $datos
     */
    public function calcularMontos(Solicitud $solicitud, array $datos, int $usuarioId): Solicitud
    {
        $montoAprobado = round((float) $datos['monto_aprobado'], 2);
        $tasa          = (float) $datos['tasa_interes'];
        $cuotas        = (int) $datos['numero_cuotas'];
        $exonerado     = (bool) $datos['seguro_exonerado'];
        $pctSeguro     = $exonerado ? 0.0 : (float) $datos['porcentaje_seguro'];

        if ($montoAprobado <= 0) {
            throw new InvalidArgumentException('El monto aprobado debe ser mayor a cero.');
        }

        // Validar rango de seguro contra parámetros configurables (no hardcodear)
        if (! $exonerado && $pctSeguro > 0) {
            $min = (float) Parametro::valor('seguro.porcentaje_min', 0.05);
            $max = (float) Parametro::valor('seguro.porcentaje_max', 0.10);
            if ($pctSeguro < $min || $pctSeguro > $max) {
                throw new InvalidArgumentException(
                    "El porcentaje de seguro debe estar entre {$min} y {$max}."
                );
            }
        }

        // --- Fórmulas ---
        $valorSeguro       = $exonerado ? 0.0 : round($montoAprobado * $pctSeguro, 2);
        $montoDesembolsado = round($montoAprobado - $valorSeguro, 2);
        $interes           = round($montoAprobado * $tasa * $cuotas, 2);  // capital × tasa × N° cuotas (sobre aprobado)
        $totalRecaudar     = round($montoAprobado + $interes, 2);
        $valorCuota        = round($totalRecaudar / max($cuotas, 1), 2);

        $solicitud->fill([
            'monto_aprobado'      => $montoAprobado,
            'tasa_interes'        => $tasa,
            'numero_cuotas'       => $cuotas,
            'porcentaje_seguro'   => $pctSeguro,
            'valor_seguro'        => $valorSeguro,
            'monto_desembolsado'  => $montoDesembolsado,
            'interes'             => $interes,
            'total_recaudar'      => $totalRecaudar,
            'total_financiado'    => $totalRecaudar,
            'valor_cuota'         => $valorCuota,
            'seguro_exonerado'    => $exonerado,
            'modalidad'           => $datos['modalidad'],
            'fecha_primer_pago'   => $datos['fecha_primer_pago'] ?? null,
        ]);

        // --- Regla de exoneración (prioridad absoluta) ---
        if ($exonerado) {
            if (empty($datos['motivo_exoneracion'])) {
                throw new InvalidArgumentException('La exoneración requiere un motivo.');
            }
            $solicitud->motivo_exoneracion           = $datos['motivo_exoneracion'];
            $solicitud->exoneracion_solicitada_por   = $usuarioId;
            // Fuerza aprobación administrativa, ignorando cualquier límite monetario.
            $solicitud->estado = EstadoSolicitud::PENDIENTE_ADMINISTRADOR->value;
        }

        $solicitud->save();

        return $solicitud;
    }

    /**
     * Decide el estado de ruteo de aprobación según exoneración y límite.
     * Si NO está exonerado, se evalúa el límite del supervisor.
     */
    public function rutearAprobacion(Solicitud $solicitud): EstadoSolicitud
    {
        if ($solicitud->seguro_exonerado) {
            return EstadoSolicitud::PENDIENTE_ADMINISTRADOR; // prioridad absoluta
        }

        $limiteSupervisor = (float) ($solicitud->area->limiteSupervisor() ?? 0);

        return $solicitud->monto_aprobado <= $limiteSupervisor
            ? EstadoSolicitud::PENDIENTE_SUPERVISOR
            : EstadoSolicitud::PENDIENTE_ADMINISTRADOR;
    }

    /**
     * Genera el cronograma de cuotas según la modalidad. Transaccional.
     */
    public function generarCronograma(Solicitud $solicitud): void
    {
        DB::transaction(function () use ($solicitud) {
            Cuota::where('solicitud_id', $solicitud->id)->delete();

            $fecha = Carbon::parse($solicitud->fecha_primer_pago ?? now()->addDay());
            $valorCuota = (float) $solicitud->valor_cuota;
            $totalRecaudar = (float) $solicitud->total_recaudar;
            $cuotas = (int) $solicitud->numero_cuotas;
            $acumulado = 0.0;

            for ($i = 1; $i <= $cuotas; $i++) {
                // La última cuota ajusta el redondeo para cuadrar exacto.
                $valor = $i === $cuotas
                    ? round($totalRecaudar - $acumulado, 2)
                    : $valorCuota;
                $acumulado += $valor;

                Cuota::create([
                    'solicitud_id'      => $solicitud->id,
                    'numero_cuota'      => $i,
                    'fecha_vencimiento' => $fecha->copy(),
                    'valor'             => $valor,
                    'valor_pagado'      => 0,
                    'saldo'             => $valor,
                    'estado'            => 'PENDIENTE',
                ]);

                $fecha = $this->siguienteFecha($fecha, $solicitud->modalidad);
            }
        });
    }

    private function siguienteFecha(Carbon $fecha, string $modalidad): Carbon
    {
        return match ($modalidad) {
            'DIARIO'    => $fecha->copy()->addDay(),
            'SEMANAL'   => $fecha->copy()->addWeek(),
            'QUINCENAL' => $fecha->copy()->addDays(15),
            'MENSUAL'   => $fecha->copy()->addMonth(),
            default     => $fecha->copy()->addMonth(),
        };
    }
}

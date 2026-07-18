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
    /** Cuántas cuotas caben en un mes según la modalidad. */
    public static function periodosPorMes(string $modalidad): int
    {
        return ['MENSUAL' => 1, 'QUINCENAL' => 2, 'SEMANAL' => 4, 'DIARIO' => 30][$modalidad] ?? 1;
    }

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

        // --- Fórmulas (MOTOR DE PRODUCTOS: el cálculo depende de la CONFIG, no del nombre) ---
        $producto = $solicitud->producto_financiero_id
            ? DB::table('productos_financieros')->where('id', $solicitud->producto_financiero_id)->first()
            : null;

        $valorSeguro       = $exonerado ? 0.0 : round($montoAprobado * $pctSeguro, 2);
        $montoDesembolsado = round($montoAprobado - $valorSeguro, 2);
        $plazoMeses        = (int) ($datos['plazo_meses'] ?? max(1, (int) round($cuotas / self::periodosPorMes($datos['modalidad']))));

        if ($producto && $producto->usa_valor_pactado) {
            // Producto de VALOR PACTADO (ej. Al Bate): el total es el valor acordado con el
            // cliente; no hay cálculo de intereses por tasa. El "interés" informativo es la
            // diferencia entre lo pactado y el capital.
            $valorPactado  = round((float) ($datos['valor_pactado'] ?? $solicitud->valor_pactado ?? 0), 2);
            if ($valorPactado <= 0) {
                throw new InvalidArgumentException('Este producto requiere el valor total pactado.');
            }
            $totalRecaudar = $valorPactado;
            $interes       = round($valorPactado - $montoAprobado, 2);
            $solicitud->valor_pactado = $valorPactado;
        } else {
            // Producto con TASA (tradicional): capital × tasa × plazo(meses).
            // Si el producto no usa tasa, la tasa efectiva llega en 0 y el interés es 0.
            $interes       = round($montoAprobado * $tasa * $plazoMeses, 2);
            $totalRecaudar = round($montoAprobado + $interes, 2);
        }
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
        // El ruteo de estado (PENDIENTE_ADMINISTRADOR) ya se define al CREAR la solicitud.
        // Aquí solo se conserva el motivo y se valida su presencia.
        if ($exonerado) {
            if (empty($datos['motivo_exoneracion'])) {
                throw new InvalidArgumentException('La exoneración requiere un motivo.');
            }
            $solicitud->motivo_exoneracion = $datos['motivo_exoneracion'];
            if (empty($solicitud->exoneracion_solicitada_por)) {
                $solicitud->exoneracion_solicitada_por = $usuarioId;
            }
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
    /**
     * Genera el cronograma de cuotas con desglose de capital e interés.
     * La primera cuota se calcula a partir de $fechaBase (fecha de desembolso)
     * más un período según la modalidad.
     */
    public function generarCronograma(Solicitud $solicitud, $fechaBase = null): void
    {
        DB::transaction(function () use ($solicitud, $fechaBase) {
            Cuota::where('solicitud_id', $solicitud->id)->delete();

            $cuotas        = (int) $solicitud->numero_cuotas;
            $capital       = (float) $solicitud->monto_aprobado;

            if ($cuotas < 1) {
                throw new InvalidArgumentException('El crédito debe tener al menos 1 cuota (numero_cuotas inválido).');
            }
            if ($capital <= 0) {
                throw new InvalidArgumentException('El crédito no tiene monto aprobado; no se puede generar el plan.');
            }
            $totalRecaudar = (float) $solicitud->total_recaudar;
            $interesTotal  = round($totalRecaudar - $capital, 2);

            $capCuota = round($capital / $cuotas, 2);
            $intCuota = round($interesTotal / $cuotas, 2);

            $accCap = 0.0;
            $accInt = 0.0;
            $fecha  = Carbon::parse($fechaBase ?? $solicitud->fecha_primer_pago ?? now());

            for ($i = 1; $i <= $cuotas; $i++) {
                // Primera cuota = fecha base + un período; las demás encadenan.
                $fecha = $this->siguienteFecha($fecha, $solicitud->modalidad);

                if ($i === $cuotas) {
                    // La última cierra exacto los acumulados.
                    $cap = round($capital - $accCap, 2);
                    $int = round($interesTotal - $accInt, 2);
                } else {
                    $cap = $capCuota;
                    $int = $intCuota;
                }
                $valor = round($cap + $int, 2);
                $accCap += $cap;
                $accInt += $int;

                Cuota::create([
                    'solicitud_id'      => $solicitud->id,
                    'numero_cuota'      => $i,
                    'fecha_vencimiento' => $fecha->copy(),
                    'valor'             => $valor,
                    'abono_capital'     => $cap,
                    'abono_interes'     => $int,
                    'valor_pagado'      => 0,
                    'saldo'             => $valor,
                    'estado'            => 'PENDIENTE',
                ]);
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

<?php

namespace App\Services;

use App\Enums\EstadoSolicitud;
use App\Models\Cliente;
use App\Models\Parametro;
use App\Models\Pago;
use App\Models\Renovacion;
use App\Models\Solicitud;
use App\Models\Usuario;
use DomainException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Reamortización / renovación / refinanciación interna de créditos.
 *
 * Reglas:
 *  - Interés Total = Capital aprobado × Tasa mensual × N° de meses (interés simple, sin capitalización).
 *  - Total deuda = Capital + Interés. El seguro NUNCA hace parte de la deuda.
 *  - Seguro = Capital × % (configurable), solo se descuenta del desembolso.
 *  - Cada renovación crea un crédito nuevo independiente, ligado al anterior (padre-hijo).
 *  - El crédito anterior nunca se modifica salvo su estado → REAMORTIZADO.
 */
class ReamortizacionService
{
    public function __construct(private LoanService $loans) {}

    /** Saldo pendiente = total deuda anterior − pagos realizados. */
    public function saldoPendiente(Solicitud $credito): float
    {
        $pagado = (float) Pago::where('solicitud_id', $credito->id)->sum('valor');
        return round((float) $credito->total_recaudar - $pagado, 2);
    }

    /**
     * Previsualiza los montos de una reamortización sin persistir nada.
     * @return array<string, float>
     */
    public function previsualizar(
        Solicitud $origen, float $nuevoCapital, float $pctSeguro,
        float $tasaMensual, int $meses, bool $exonerado = false, string $modalidad = 'MENSUAL'
    ): array {
        $saldo = $this->saldoPendiente($origen);
        $pct   = $exonerado ? 0.0 : $pctSeguro;

        $seguro          = round($nuevoCapital * $pct, 2);
        $valorDesembolso = round($nuevoCapital - $seguro, 2);                 // bruto del préstamo
        $interes         = round($nuevoCapital * $tasaMensual * $meses, 2);   // SIEMPRE sobre capital aprobado
        $totalDeuda      = round($nuevoCapital + $interes, 2);                // sin seguro
        $dineroAdicional = round($nuevoCapital - $saldo, 2);                  // capital nuevo − saldo refinanciado
        $recibidoCliente = round(max($valorDesembolso - $saldo, 0), 2);       // efectivo realmente entregado
        $numeroCuotas    = max($meses, 1) * LoanService::periodosPorMes($modalidad);
        $valorCuota      = round($totalDeuda / $numeroCuotas, 2);

        return [
            'saldo_pendiente'     => $saldo,
            'nuevo_capital'       => round($nuevoCapital, 2),
            'porcentaje_seguro'   => $pct,
            'valor_seguro'        => $seguro,
            'valor_desembolsado'  => $valorDesembolso,
            'saldo_refinanciado'  => $saldo,
            'dinero_adicional'    => $dineroAdicional,
            'recibido_cliente'    => $recibidoCliente,
            'interes_generado'    => $interes,
            'total_deuda_nueva'   => $totalDeuda,
            'valor_cuota'         => $valorCuota,
            'numero_cuotas'       => $numeroCuotas,
        ];
    }

    /**
     * Ejecuta la reamortización. Crea el crédito nuevo, cierra el anterior,
     * registra el historial y reduce el cupo. Todo atómico.
     */
    public function reamortizar(Solicitud $origen, array $d, Usuario $usuario): Solicitud
    {
        $cliente = $origen->cliente;

        // Estado del crédito origen debe permitir reamortización
        if (! EstadoSolicitud::from($origen->estado)->esReamortizable()) {
            throw new DomainException('El crédito no está en un estado reamortizable (debe estar ACTIVO, DESEMBOLSADO o EN_MORA).');
        }

        // Inicializar cupo del cliente si aún no existe (toma el capital del crédito origen)
        if ((float) $cliente->cupo_inicial <= 0) {
            $cliente->cupo_inicial   = (float) $origen->monto_aprobado;
            $cliente->cupo_disponible = (float) $origen->monto_aprobado;
        }

        $saldo        = $this->saldoPendiente($origen);
        $nuevoCapital = round((float) $d['nuevo_capital'], 2);
        $exonerado    = (bool) ($d['seguro_exonerado'] ?? false);
        $pct          = $exonerado ? 0.0 : (float) $d['porcentaje_seguro'];
        $tasaMensual  = (float) $d['tasa_mensual'];
        $meses        = (int) $d['plazo_meses'];
        $cupoActual   = (float) $cliente->cupo_disponible;

        // --- Validaciones obligatorias ---
        if ($nuevoCapital < $saldo) {
            throw new DomainException("El nuevo capital ({$nuevoCapital}) no puede ser inferior al saldo pendiente ({$saldo}).");
        }
        if ($nuevoCapital > $cupoActual) {
            throw new DomainException("El nuevo capital ({$nuevoCapital}) supera el cupo disponible ({$cupoActual}).");
        }
        if ($exonerado && empty($d['motivo_exoneracion'])) {
            throw new DomainException('La exoneración de seguro requiere un motivo.');
        }
        if ($meses < 1) {
            throw new DomainException('El plazo en meses debe ser al menos 1.');
        }

        $modalidad = $d['modalidad'] ?? 'MENSUAL';
        $calc = $this->previsualizar($origen, $nuevoCapital, $pct, $tasaMensual, $meses, $exonerado, $modalidad);

        return DB::transaction(function () use ($origen, $cliente, $usuario, $d, $calc, $nuevoCapital, $pct, $tasaMensual, $meses, $saldo, $exonerado) {
            // 1) Crear crédito nuevo (independiente, ligado al origen)
            $nuevo = new Solicitud([
                'cliente_id'           => $origen->cliente_id,
                'area_id'              => $origen->area_id,
                'cobrador_id'          => $origen->cobrador_id,
                'es_venta_financiada'  => false,
                'capital_solicitado'   => $nuevoCapital,
                'monto_aprobado'       => $nuevoCapital,
                'tasa_interes'         => $tasaMensual,
                'tipo_interes'         => 'FIJO',
                'interes'              => $calc['interes_generado'],
                'modalidad'            => $d['modalidad'] ?? 'MENSUAL',
                'numero_cuotas'        => $calc['numero_cuotas'],
                'plazo_meses'          => $meses,
                'fecha_primer_pago'    => $d['fecha_primer_pago'] ?? now()->addMonth()->toDateString(),
                'valor_cuota'          => $calc['valor_cuota'],
                'total_financiado'     => $calc['total_deuda_nueva'],
                'porcentaje_seguro'    => $pct,
                'valor_seguro'         => $calc['valor_seguro'],
                'monto_desembolsado'   => $calc['valor_desembolsado'],
                'total_recaudar'       => $calc['total_deuda_nueva'],
                'seguro_exonerado'     => $exonerado,
                'motivo_exoneracion'   => $exonerado ? ($d['motivo_exoneracion'] ?? null) : null,
                'exoneracion_aprobada_por' => $exonerado ? $usuario->id : null,
                'estado'               => EstadoSolicitud::ACTIVO->value,
                'usuario_aprobador'    => $usuario->id,
                'fecha_aprobacion'     => now(),
                'fecha_solicitud'      => now()->toDateString(),
                'credito_origen_id'    => $origen->id,
                'saldo_refinanciado'   => $saldo,
                'created_by'           => $usuario->id,
            ]);
            $nuevo->save();

            // 2) Cronograma del crédito nuevo
            $this->loans->generarCronograma($nuevo);

            // 3) Cerrar el crédito origen (sin tocar su historial)
            $origen->total_pagado = (float) Pago::where('solicitud_id', $origen->id)->sum('valor');
            $origen->estado = EstadoSolicitud::REAMORTIZADO->value;
            $origen->save();

            // 4) Reducir el cupo disponible (configurable)
            $reduccion = (float) Parametro::valor('cupo.reduccion_por_renovacion', 100000);
            $cupoDespues = max(round((float) $cliente->cupo_disponible - $reduccion, 2), 0);
            $cliente->cupo_disponible = $cupoDespues;
            $cliente->save();

            // 5) Registrar el historial de la renovación
            Renovacion::create([
                'credito_origen_id'       => $origen->id,
                'credito_nuevo_id'        => $nuevo->id,
                'cliente_id'              => $origen->cliente_id,
                'saldo_refinanciado'      => $saldo,
                'capital_aprobado'        => $nuevoCapital,
                'porcentaje_seguro'       => $pct,
                'valor_seguro'            => $calc['valor_seguro'],
                'valor_desembolsado'      => $calc['valor_desembolsado'],
                'dinero_adicional'        => $calc['dinero_adicional'],
                'recibido_cliente'        => $calc['recibido_cliente'],
                'interes_generado'        => $calc['interes_generado'],
                'total_deuda_nueva'       => $calc['total_deuda_nueva'],
                'cupo_disponible_despues' => $cupoDespues,
                'realizado_por'           => $usuario->id,
                'fecha_renovacion'        => now(),
            ]);

            return $nuevo->fresh();
        });
    }

    /**
     * Devuelve la cadena completa de créditos del cliente (raíz → última renovación).
     * @return Collection<int, Solicitud>
     */
    public function historial(Solicitud $credito): Collection
    {
        // Subir hasta la raíz
        $raiz = $credito;
        while ($raiz->creditoOrigen) {
            $raiz = $raiz->creditoOrigen;
        }
        // Bajar recolectando la cadena
        $cadena = collect();
        $actual = $raiz;
        while ($actual) {
            $cadena->push($actual);
            $actual = Solicitud::where('credito_origen_id', $actual->id)->first();
        }
        return $cadena;
    }

    /** Ajuste administrativo del cupo del cliente. */
    public function definirCupo(Cliente $cliente, float $cupoInicial, ?float $cupoDisponible = null): Cliente
    {
        $cliente->cupo_inicial = round($cupoInicial, 2);
        $cliente->cupo_disponible = round($cupoDisponible ?? $cupoInicial, 2);
        $cliente->save();
        return $cliente;
    }
}

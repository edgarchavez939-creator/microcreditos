<?php

namespace App\Services;

use App\Enums\EstadoSolicitud;
use App\Models\Cuota;
use App\Models\MovimientoCaja;
use App\Models\Pago;
use App\Models\Solicitud;
use App\Models\Usuario;
use DomainException;
use Illuminate\Support\Facades\DB;

class PaymentService
{
    /**
     * Registra un pago y lo aplica en cascada a las cuotas pendientes
     * (más antigua primero). Idempotente por client_uuid (sync offline).
     */
    public function registrarPago(Solicitud $credito, array $d, Usuario $usuario): Pago
    {
        // Idempotencia: si el pago offline ya entró, devolver el existente.
        if (! empty($d['client_uuid'])) {
            $existente = Pago::where('client_uuid', $d['client_uuid'])->first();
            if ($existente) {
                return $existente;
            }
        }

        $valor = round((float) $d['valor'], 2);
        if ($valor <= 0) {
            throw new DomainException('El valor del pago debe ser mayor a cero.');
        }

        return DB::transaction(function () use ($credito, $d, $usuario, $valor) {
            $pago = Pago::create([
                'cliente_id'     => $credito->cliente_id,
                'solicitud_id'   => $credito->id,
                'cuota_id'       => $d['cuota_id'] ?? null,
                'fecha'          => $d['fecha'] ?? now()->toDateString(),
                'valor'          => $valor,
                'metodo'         => $d['metodo'],
                'registrado_por' => $usuario->id,
                'client_uuid'    => $d['client_uuid'] ?? null,
            ]);

            // Aplicar en cascada a las cuotas abiertas (orden por número)
            $restante = $valor;
            $cuotas = Cuota::where('solicitud_id', $credito->id)
                ->whereIn('estado', ['PENDIENTE', 'PARCIAL', 'VENCIDA'])
                ->orderBy('numero_cuota')
                ->lockForUpdate()
                ->get();

            foreach ($cuotas as $cuota) {
                if ($restante <= 0) {
                    break;
                }
                $abono = min($restante, (float) $cuota->saldo);
                $cuota->valor_pagado = round((float) $cuota->valor_pagado + $abono, 2);
                $cuota->saldo        = round((float) $cuota->saldo - $abono, 2);
                $cuota->estado       = $cuota->saldo <= 0 ? 'PAGADA' : 'PARCIAL';
                $cuota->save();
                $restante = round($restante - $abono, 2);
            }

            // Caja: ingreso por el pago
            MovimientoCaja::create([
                'fecha'           => now()->toDateString(),
                'tipo'            => 'INGRESO',
                'concepto'        => "Pago crédito #{$credito->id}",
                'valor'           => $valor,
                'referencia_tipo' => 'PAGO',
                'referencia_id'   => $pago->id,
                'area_id'         => $credito->area_id,
                'registrado_por'  => $usuario->id,
            ]);

            // ¿Crédito totalmente saldado?
            $pendientes = Cuota::where('solicitud_id', $credito->id)
                ->where('estado', '!=', 'PAGADA')->count();
            if ($pendientes === 0 && $credito->estado === EstadoSolicitud::ACTIVO->value) {
                $credito->total_pagado = (float) Pago::where('solicitud_id', $credito->id)->sum('valor');
                $credito->estado = EstadoSolicitud::PAGADO->value;
                $credito->save();
            }

            return $pago;
        });
    }
}

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

        // Las transferencias se aplican SOLO cuando el supervisor las aprueba.
        $esTransferencia = $d['metodo'] === 'TRANSFERENCIA';

        return DB::transaction(function () use ($credito, $d, $usuario, $valor, $esTransferencia) {
            $pago = Pago::create([
                'cliente_id'     => $credito->cliente_id,
                'solicitud_id'   => $credito->id,
                'cuota_id'       => $d['cuota_id'] ?? null,
                'fecha'          => $d['fecha'] ?? now()->toDateString(),
                'valor'          => $valor,
                'metodo'         => $d['metodo'],
                'registrado_por' => $usuario->id,
                'observaciones'  => $d['observaciones'] ?? null,
                'client_uuid'    => $d['client_uuid'] ?? null,
                'aplicado'       => ! $esTransferencia,
            ]);

            // Efectivo: aplicar de inmediato. Transferencia: esperar aprobación.
            if (! $esTransferencia) {
                $this->aplicarACuotas($credito->id, $valor);
            }

            // Registro de validación para transferencias
            if ($d['metodo'] === 'TRANSFERENCIA') {
                \App\Models\Transferencia::create([
                    'pago_id'        => $pago->id,
                    'cliente_id'     => $credito->cliente_id,
                    'banco'          => $d['banco'] ?? 'No indicado',
                    'referencia'     => $d['referencia'] ?? 'No indicada',
                    'valor'          => $pago->valor,
                    'estado'         => 'PENDIENTE_VALIDACION',
                    'registrado_por' => $usuario->id,
                ]);
            }

            // Comprobante de transferencia (opcional)
            if (! empty($d['comprobante'])) {
                $c = $d['comprobante'];
                \App\Models\Documento::create([
                    'cliente_id'       => $credito->cliente_id,
                    'solicitud_id'     => $credito->id,
                    'categoria'        => 'COMPROBANTE_PAGO',
                    's3_key'           => null,
                    'nombre_original'  => $c['nombre'],
                    'mime'             => $c['mime'],
                    'tamano_bytes'     => $c['tamano'],
                    'contenido_base64' => $c['contenido_base64'],
                    'subido_por'       => $usuario->id,
                ]);
            }

            // Caja: ingreso por el pago (solo si quedó aplicado)
            if (! $esTransferencia) MovimientoCaja::create([
                'fecha'           => now()->toDateString(),
                'tipo'            => 'INGRESO',
                'concepto'        => "Pago crédito #{$credito->id}",
                'valor'           => $valor,
                'referencia_tipo' => 'PAGO',
                'referencia_id'   => $pago->id,
                'area_id'         => $credito->area_id,
                'registrado_por'  => $usuario->id,
            ]);

            // ¿Crédito totalmente saldado? (solo cuenta pagos aplicados)
            if (! $esTransferencia) {
                $this->cerrarSiSaldado($credito);
            }

            return $pago;
        });
    }

    /** Aplica un valor en cascada a las cuotas abiertas del crédito (más antigua primero). */
    private function aplicarACuotas(int $solicitudId, float $valor): void
    {
        $restante = $valor;
        $cuotas = Cuota::where('solicitud_id', $solicitudId)
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
    }

    /**
     * Revierte el pago asociado a una transferencia rechazada:
     * elimina el pago y su ingreso de caja, y recalcula las cuotas
     * reaplicando desde cero los pagos que sí siguen vigentes.
     */
    public function revertirPagoDeTransferencia(\App\Models\Transferencia $transferencia): void
    {
        $pago = Pago::find($transferencia->pago_id);
        if (! $pago) {
            return; // nada que revertir
        }
        // Conservar el historial de la transferencia desligándola del pago
        DB::table('transferencias')->where('id', $transferencia->id)->update(['pago_id' => null]);
        $this->revertirPago($pago);
    }

    /** Revierte cualquier pago: elimina pago + caja y recalcula el crédito desde cero. */
    public function revertirPago(Pago $pago): void
    {
        DB::transaction(function () use ($pago) {
            $creditoId = (int) $pago->solicitud_id;

            // Si alguna transferencia apunta a este pago, desligarla primero (conserva su historial)
            DB::table('transferencias')->where('pago_id', $pago->id)->update(['pago_id' => null]);

            // Eliminar el ingreso de caja y el pago
            MovimientoCaja::where('referencia_tipo', 'PAGO')->where('referencia_id', $pago->id)->delete();
            $pago->delete();

            // Recalcular las cuotas desde cero con los pagos restantes (en orden cronológico)
            Cuota::where('solicitud_id', $creditoId)->update([
                'valor_pagado' => 0,
                'saldo'        => DB::raw('valor'),
                'estado'       => 'PENDIENTE',
            ]);
            $restantes = Pago::where('solicitud_id', $creditoId)->where('aplicado', true)
                ->orderBy('created_at')->orderBy('id')->get();
            foreach ($restantes as $p) {
                $this->aplicarACuotas($creditoId, (float) $p->valor);
            }

            // Estado y total del crédito (query builder: elude el guard de créditos históricos)
            $pendientes  = Cuota::where('solicitud_id', $creditoId)->where('estado', '!=', 'PAGADA')->count();
            $totalPagado = (float) Pago::where('solicitud_id', $creditoId)->where('aplicado', true)->sum('valor');
            $cambios = ['total_pagado' => $totalPagado];
            $estadoActual = DB::table('solicitudes')->where('id', $creditoId)->value('estado');
            if ($pendientes > 0 && $estadoActual === 'PAGADO') {
                $cambios['estado'] = 'ACTIVO'; // el crédito se reabre
            }
            DB::table('solicitudes')->where('id', $creditoId)->update($cambios);
        });
    }

    /** Marca el crédito como PAGADO si no quedan cuotas abiertas. */
    private function cerrarSiSaldado(Solicitud $credito): void
    {
        $pendientes = Cuota::where('solicitud_id', $credito->id)
            ->where('estado', '!=', 'PAGADA')->count();
        if ($pendientes === 0 && in_array($credito->estado, [EstadoSolicitud::ACTIVO->value, EstadoSolicitud::EN_MORA->value], true)) {
            $credito->total_pagado = (float) Pago::where('solicitud_id', $credito->id)
                ->where('aplicado', true)->sum('valor');
            $credito->estado = EstadoSolicitud::PAGADO->value;
            $credito->save();
        }
    }

    /** Aplica el pago de una transferencia APROBADA: cuotas + caja + cierre. */
    public function aplicarPagoAprobado(\App\Models\Transferencia $transferencia, Usuario $validador): void
    {
        DB::transaction(function () use ($transferencia, $validador) {
            $pago = Pago::lockForUpdate()->find($transferencia->pago_id);
            if (! $pago || $pago->aplicado) {
                return; // nada que aplicar (o ya aplicado)
            }

            $credito = Solicitud::findOrFail($pago->solicitud_id);

            $this->aplicarACuotas($credito->id, (float) $pago->valor);

            MovimientoCaja::create([
                'fecha'           => now()->toDateString(),
                'tipo'            => 'INGRESO',
                'concepto'        => "Pago crédito #{$credito->id} (transferencia aprobada)",
                'valor'           => (float) $pago->valor,
                'referencia_tipo' => 'PAGO',
                'referencia_id'   => $pago->id,
                'area_id'         => $credito->area_id,
                'registrado_por'  => $validador->id,
            ]);

            $pago->aplicado = true;
            $pago->save();

            $this->cerrarSiSaldado($credito->fresh());
        });
    }
}

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
                'observaciones'  => $d['observaciones'] ?? null,
                'client_uuid'    => $d['client_uuid'] ?? null,
            ]);

            // Aplicar en cascada a las cuotas abiertas (orden por número)
            $this->aplicarACuotas($credito->id, $valor);

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
        DB::transaction(function () use ($transferencia) {
            $pago = Pago::find($transferencia->pago_id);
            if (! $pago) {
                return; // nada que revertir
            }
            $creditoId = (int) $pago->solicitud_id;

            // Conservar el historial de la transferencia (banco/referencia/motivo) desligándola del pago
            DB::table('transferencias')->where('id', $transferencia->id)->update(['pago_id' => null]);

            // Eliminar el ingreso de caja y el pago
            MovimientoCaja::where('referencia_tipo', 'PAGO')->where('referencia_id', $pago->id)->delete();
            $pago->delete();

            // Recalcular las cuotas desde cero con los pagos restantes (en orden cronológico)
            Cuota::where('solicitud_id', $creditoId)->update([
                'valor_pagado' => 0,
                'saldo'        => DB::raw('valor'),
                'estado'       => 'PENDIENTE',
            ]);
            $restantes = Pago::where('solicitud_id', $creditoId)->orderBy('created_at')->orderBy('id')->get();
            foreach ($restantes as $p) {
                $this->aplicarACuotas($creditoId, (float) $p->valor);
            }

            // Estado y total del crédito (query builder: elude el guard de créditos históricos)
            $pendientes  = Cuota::where('solicitud_id', $creditoId)->where('estado', '!=', 'PAGADA')->count();
            $totalPagado = (float) Pago::where('solicitud_id', $creditoId)->sum('valor');
            $cambios = ['total_pagado' => $totalPagado];
            $estadoActual = DB::table('solicitudes')->where('id', $creditoId)->value('estado');
            if ($pendientes > 0 && $estadoActual === 'PAGADO') {
                $cambios['estado'] = 'ACTIVO'; // el crédito se reabre
            }
            DB::table('solicitudes')->where('id', $creditoId)->update($cambios);
        });
    }
}

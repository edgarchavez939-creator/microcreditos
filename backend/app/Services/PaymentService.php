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

        // Guardia de tesorería: un cobro en EFECTIVO impacta la caja al instante, así que
        // exige la caja ABIERTA. Las transferencias van a validación (no tocan caja aún),
        // por lo que no requieren apertura. Los pagos offline ya sincronizados conservan su
        // fecha original; el guardia aplica al momento de registrarse en línea.
        if (! $esTransferencia) {
            app(\App\Services\AperturaCajaService::class)->exigirAbierta($usuario->id);
        }

        return DB::transaction(function () use ($credito, $d, $usuario, $valor, $esTransferencia) {
            $pago = Pago::create([
                'cliente_id'     => $credito->cliente_id,
                'solicitud_id'   => $credito->id,
                'cuota_id'       => $d['cuota_id'] ?? null,
                'fecha'          => $d['fecha'] ?? now()->toDateString(),
                'valor'          => $valor,
                'metodo'         => $d['metodo'],
                'registrado_por' => $usuario->id,
                'collected_by'   => $usuario->id, // quien recauda = propietario del movimiento económico
                'observaciones'  => $d['observaciones'] ?? null,
                'client_uuid'    => $d['client_uuid'] ?? null,
                'aplicado'       => ! $esTransferencia,
            ]);

            // Efectivo: aplicar de inmediato. Transferencia: esperar aprobación.
            if (! $esTransferencia) {
                $this->aplicarACuotas($credito->id, $valor);
            }

            // Registro de validación para transferencias
            $transferencia = null;
            if ($d['metodo'] === 'TRANSFERENCIA') {
                $transferencia = \App\Models\Transferencia::create([
                    'pago_id'        => $pago->id,
                    'cliente_id'     => $credito->cliente_id,
                    'banco'          => $d['banco'] ?? 'No indicado',
                    'referencia'     => $d['referencia'] ?? 'No indicada',
                    'valor'          => $pago->valor,
                    'estado'         => 'PENDIENTE_VALIDACION',
                    'registrado_por' => $usuario->id,
                ]);
            }

            // Comprobante de transferencia (opcional): vinculado al pago Y a la transferencia,
            // así la evidencia se conserva aunque el pago se revierta o el estado cambie.
            if (! empty($d['comprobante'])) {
                $c = $d['comprobante'];
                \App\Models\Documento::create([
                    'cliente_id'       => $credito->cliente_id,
                    'solicitud_id'     => $credito->id,
                    'pago_id'          => $pago->id,
                    'transferencia_id' => $transferencia?->id,
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
                'medio_pago'      => $d['metodo'], // conserva el medio real (EFECTIVO/NEQUI/DAVIPLATA)
                'referencia_tipo' => 'PAGO',
                'referencia_id'   => $pago->id,
                'area_id'         => $credito->area_id,
                'registrado_por'  => $usuario->id,
            ]);

            // ¿Crédito totalmente saldado? (solo cuenta pagos aplicados)
            if (! $esTransferencia) {
                $this->cerrarSiSaldado($credito);
                // Crédito migrado: su primer pago APLICADO bloquea la edición (Fase 2)
                \App\Services\MigracionService::bloquearSiMigrado($credito->id, $usuario->id, 'PAGO');
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
    public function revertirPago(Pago $pago, ?\App\Models\Usuario $usuario = null, ?string $motivo = null): void
    {
        DB::transaction(function () use ($pago, $usuario, $motivo) {
            $creditoId = (int) $pago->solicitud_id;

            // Si el pago provino de una transferencia, sincronizarla: pasa a RECHAZADO
            // con la observación pedida y queda registrada en auditoría (trazabilidad completa).
            $observacion = $motivo ? "Anulado desde Extracto: {$motivo}" : 'Anulado desde Extracto';
            $transfers = DB::table('transferencias')->where('pago_id', $pago->id)->get();
            foreach ($transfers as $t) {
                DB::table('transferencias')->where('id', $t->id)->update([
                    'estado'         => 'RECHAZADO',
                    'motivo_rechazo' => $observacion,
                    'validado_por'   => $usuario?->id ?? $t->validado_por,
                    'validado_at'    => now(),
                    'pago_id'        => null, // desligar conservando el historial de la transferencia
                ]);

                DB::table('auditoria')->insert([
                    'usuario_id'      => $usuario?->id,
                    'accion'          => 'REJECT',
                    'entidad'         => 'transferencias',
                    'entidad_id'      => $t->id,
                    'datos_anteriores'=> json_encode(['estado' => $t->estado]),
                    'datos_nuevos'    => json_encode([
                        'estado'      => 'RECHAZADO',
                        'observacion' => $observacion,
                        'origen'      => 'ANULACION_PAGO',
                        'pago_id'     => $pago->id,
                    ]),
                    'ip'         => request()?->ip(),
                    'user_agent' => request()?->userAgent(),
                    'created_at' => now(),
                ]);
            }

            // El comprobante se CONSERVA como evidencia: solo se desliga del pago eliminado
            DB::table('documentos')->where('pago_id', $pago->id)->update(['pago_id' => null]);

            // Trazabilidad de la anulación (antes de borrar): quién y cuándo anuló.
            if ($usuario) {
                DB::table('pagos')->where('id', $pago->id)->update([
                    'cancelled_by' => $usuario->id,
                    'cancelled_at' => now(),
                ]);
            }

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
        if ($pendientes === 0 && in_array($credito->estado, [EstadoSolicitud::ACTIVO->value, EstadoSolicitud::EN_MORA->value, 'MIGRADO'], true)) {
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
            // Crédito migrado: la transferencia aprobada es su primer movimiento aplicado
            \App\Services\MigracionService::bloquearSiMigrado($credito->id, $validador->id, 'PAGO_TRANSFERENCIA');

            $this->aplicarACuotas($credito->id, (float) $pago->valor);

            // PROPIEDAD DEL MOVIMIENTO ECONÓMICO: pertenece a quien recaudó el pago
            // (collected_by), NO al supervisor que aprueba. El validador solo queda
            // registrado como approved_by para auditoría, sin afectar su caja.
            $recaudador = $pago->collected_by ?? $pago->registrado_por;

            MovimientoCaja::create([
                'fecha'           => now()->toDateString(),
                'tipo'            => 'INGRESO',
                'concepto'        => "Pago crédito #{$credito->id} (transferencia aprobada)",
                'valor'           => (float) $pago->valor,
                'medio_pago'      => 'TRANSFERENCIA', // conserva el medio original; NO es efectivo
                'referencia_tipo' => 'PAGO',
                'referencia_id'   => $pago->id,
                'area_id'         => $credito->area_id,
                'registrado_por'  => $recaudador, // caja del recaudador, no del validador
            ]);

            $pago->aplicado = true;
            $pago->approved_by = $validador->id; // trazabilidad de la aprobación (no afecta caja)
            $pago->save();

            $this->cerrarSiSaldado($credito->fresh());
        });
    }
}

<?php

namespace App\Services;

use App\Enums\EstadoSolicitud;
use App\Models\Cuota;
use App\Models\Desembolso;
use App\Models\MovimientoCaja;
use App\Models\Solicitud;
use App\Models\Usuario;
use DomainException;
use Illuminate\Support\Facades\DB;

class DesembolsoService
{
    public function __construct(private LoanService $loans) {}

    /**
     * Desembolsa un crédito APROBADO: registra el desembolso, genera el
     * cronograma si falta, mueve la caja (egreso) y lo deja ACTIVO.
     */
    public function desembolsar(Solicitud $credito, array $d, Usuario $usuario): Solicitud
    {
        if ($credito->estado !== EstadoSolicitud::APROBADO->value) {
            throw new DomainException('Solo se puede desembolsar un crédito en estado APROBADO.');
        }

        // MOTOR DE PRODUCTOS: validar que el método de desembolso esté permitido
        // por la configuración del producto del crédito.
        if ($credito->producto_financiero_id) {
            $pf = DB::table('productos_financieros')->where('id', $credito->producto_financiero_id)->first();
            if ($pf) {
                if (($d['metodo'] ?? null) === 'EFECTIVO' && ! $pf->permite_desembolso_efectivo) {
                    throw new DomainException("El producto {$pf->nombre} no permite desembolso en efectivo.");
                }
                if (($d['metodo'] ?? null) === 'TRANSFERENCIA' && ! $pf->permite_desembolso_transferencia) {
                    throw new DomainException("El producto {$pf->nombre} no permite desembolso por transferencia.");
                }
            }
        }

        // Guardia de tesorería: un desembolso en EFECTIVO reduce el efectivo de la caja,
        // así que exige la caja ABIERTA. Por transferencia no toca el efectivo en caja.
        if (($d['metodo'] ?? null) === 'EFECTIVO') {
            app(\App\Services\AperturaCajaService::class)->exigirAbierta($usuario->id);
        }

        return DB::transaction(function () use ($credito, $d, $usuario) {
            // Valor neto a entregar (aprobado − seguro) salvo que se indique otro
            $valor = isset($d['valor']) ? round((float) $d['valor'], 2) : (float) $credito->monto_desembolsado;

            Desembolso::create([
                'solicitud_id'  => $credito->id,
                'fecha'         => $d['fecha'] ?? now()->toDateString(),
                'valor'         => $valor,
                'metodo'        => $d['metodo'],
                'registrado_por'=> $usuario->id,
            ]);

            // Regenerar el cronograma con la fecha de inicio indicada al desembolsar.
            // Seguro: solo si aún no hay pagos aplicados.
            if (\App\Models\Pago::where('solicitud_id', $credito->id)->count() === 0) {
                $this->loans->generarCronograma($credito, $d['fecha'] ?? now());
            }

            // Caja: egreso por el desembolso (conserva el medio real)
            MovimientoCaja::create([
                'fecha'           => now()->toDateString(),
                'tipo'            => 'EGRESO',
                'concepto'        => "Desembolso crédito #{$credito->id}",
                'valor'           => $valor,
                'medio_pago'      => $d['metodo'], // EFECTIVO/TRANSFERENCIA: define si afecta el efectivo
                'referencia_tipo' => 'DESEMBOLSO',
                'referencia_id'   => $credito->id,
                'area_id'         => $credito->area_id,
                'registrado_por'  => $usuario->id,
            ]);

            // Transición APROBADO → DESEMBOLSADO → ACTIVO
            $credito->estado = EstadoSolicitud::DESEMBOLSADO->value;
            $credito->save();
            $credito->estado = EstadoSolicitud::ACTIVO->value;
            $credito->save();

            return $credito->fresh()->load('cuotas');
        });
    }

    /**
     * ANULAR UN DESEMBOLSO (reversión completa y trazable).
     *
     * Reglas:
     *  - Solo se anula un crédito DESEMBOLSADO/ACTIVO que aún NO tenga pagos aplicados.
     *  - El histórico NUNCA se borra: el desembolso se marca como anulado y se registra
     *    un movimiento de caja INVERSO (ingreso) que devuelve el efectivo a la caja.
     *  - El recaudo por seguros se reversa automáticamente: el cálculo del día lo deriva
     *    de los desembolsos vigentes, y este deja de estar vigente.
     *  - El crédito regresa a APROBADO y se elimina su cronograma (sin pagos, es seguro).
     *  - Si el desembolso fue en efectivo, exige caja ABIERTA: el dinero vuelve a una caja.
     */
    public function anular(Solicitud $credito, string $motivo, Usuario $usuario): Solicitud
    {
        $desembolso = Desembolso::where('solicitud_id', $credito->id)
            ->whereNull('anulado_at')
            ->latest('id')
            ->first();

        if (! $desembolso) {
            throw new DomainException('Este crédito no tiene un desembolso vigente que anular.');
        }
        if (\App\Models\Pago::where('solicitud_id', $credito->id)->exists()) {
            throw new DomainException('No se puede anular: el crédito ya tiene pagos registrados. Anula primero los pagos.');
        }
        if (! in_array($credito->estado, [EstadoSolicitud::DESEMBOLSADO->value, EstadoSolicitud::ACTIVO->value], true)) {
            throw new DomainException('Solo se puede anular el desembolso de un crédito desembolsado o activo.');
        }

        // El efectivo vuelve a la caja: exige caja abierta para recibirlo.
        if ($desembolso->metodo === 'EFECTIVO') {
            app(\App\Services\AperturaCajaService::class)->exigirAbierta($usuario->id);
        }

        return DB::transaction(function () use ($credito, $desembolso, $motivo, $usuario) {
            // 1) Marcar el desembolso como anulado (nunca se elimina)
            $desembolso->anulado_at       = now();
            $desembolso->anulado_por      = $usuario->id;
            $desembolso->motivo_anulacion = $motivo;
            $desembolso->save();

            // 2) Movimiento de caja INVERSO en la fecha real de la anulación
            MovimientoCaja::create([
                'fecha'           => now()->toDateString(),
                'tipo'            => 'INGRESO',
                'concepto'        => "Anulación desembolso crédito #{$credito->id}",
                'valor'           => $desembolso->valor,
                'medio_pago'      => $desembolso->metodo,
                'referencia_tipo' => 'ANULACION_DESEMBOLSO',
                'referencia_id'   => $credito->id,
                'area_id'         => $credito->area_id,
                'observacion'     => $motivo,
                'registrado_por'  => $usuario->id,
            ]);

            // 3) Eliminar el cronograma (seguro: se validó que no hay pagos)
            Cuota::where('solicitud_id', $credito->id)->delete();

            // 4) El crédito regresa a APROBADO, listo para desembolsarse de nuevo
            $credito->estado = EstadoSolicitud::APROBADO->value;
            $credito->save();

            // 5) Auditoría
            DB::table('auditoria')->insert([
                'usuario_id'   => $usuario->id,
                'accion'       => 'DESEMBOLSO_ANULADO',
                'entidad'      => 'solicitud',
                'entidad_id'   => $credito->id,
                'datos_nuevos' => json_encode([
                    'desembolso_id' => $desembolso->id,
                    'valor'         => (float) $desembolso->valor,
                    'metodo'        => $desembolso->metodo,
                    'motivo'        => $motivo,
                ], JSON_UNESCAPED_UNICODE),
                'created_at'   => now(),
            ]);

            return $credito->fresh();
        });
    }
}

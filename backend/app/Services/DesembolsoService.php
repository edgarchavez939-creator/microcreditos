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

            // Cronograma de cuotas (si aún no existe)
            if (Cuota::where('solicitud_id', $credito->id)->count() === 0) {
                $this->loans->generarCronograma($credito);
            }

            // Caja: egreso por el desembolso
            MovimientoCaja::create([
                'fecha'           => now()->toDateString(),
                'tipo'            => 'EGRESO',
                'concepto'        => "Desembolso crédito #{$credito->id}",
                'valor'           => $valor,
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
}

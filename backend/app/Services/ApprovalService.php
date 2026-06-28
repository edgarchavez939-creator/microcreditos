<?php

namespace App\Services;

use App\Enums\EstadoSolicitud;
use App\Models\LimiteAprobacion;
use App\Models\Solicitud;
use App\Models\Usuario;
use DomainException;
use Illuminate\Support\Facades\DB;

class ApprovalService
{
    /**
     * Aprueba una solicitud validando rol, exoneración y límite (desde BD).
     */
    public function aprobar(Solicitud $solicitud, Usuario $aprobador): Solicitud
    {
        $estadoActual = EstadoSolicitud::from($solicitud->estado);

        // Regla absoluta: exoneración => solo ADMINISTRADOR
        if ($solicitud->seguro_exonerado && $aprobador->rol !== 'ADMINISTRADOR') {
            throw new DomainException('Una solicitud con seguro exonerado solo puede aprobarla un administrador.');
        }

        if ($aprobador->rol === 'SUPERVISOR') {
            if ($estadoActual !== EstadoSolicitud::PENDIENTE_SUPERVISOR) {
                throw new DomainException('La solicitud no está pendiente de supervisor.');
            }
            $limite = $this->limiteDe($aprobador, $solicitud);
            if ((float) $solicitud->monto_aprobado > $limite) {
                throw new DomainException(
                    "El monto supera el límite del supervisor ({$limite}). Debe escalar a administrador."
                );
            }
        } elseif ($aprobador->rol === 'ADMINISTRADOR') {
            if (! in_array($estadoActual, [
                EstadoSolicitud::PENDIENTE_SUPERVISOR,
                EstadoSolicitud::PENDIENTE_ADMINISTRADOR,
            ], true)) {
                throw new DomainException('La solicitud no está en un estado aprobable.');
            }
        } else {
            throw new DomainException('Su rol no tiene permiso de aprobación.');
        }

        if (! $estadoActual->puedeTransicionarA(EstadoSolicitud::APROBADO)) {
            throw new DomainException("Transición inválida desde {$estadoActual->value} a APROBADO.");
        }

        return DB::transaction(function () use ($solicitud, $aprobador) {
            $solicitud->estado            = EstadoSolicitud::APROBADO->value;
            $solicitud->usuario_aprobador = $aprobador->id;
            $solicitud->fecha_aprobacion  = now();
            if ($solicitud->seguro_exonerado) {
                $solicitud->exoneracion_aprobada_por = $aprobador->id;
            }
            $solicitud->save();
            return $solicitud;
        });
    }

    public function rechazar(Solicitud $solicitud, Usuario $usuario, string $motivo): Solicitud
    {
        $estadoActual = EstadoSolicitud::from($solicitud->estado);
        if (! $estadoActual->puedeTransicionarA(EstadoSolicitud::RECHAZADO)) {
            throw new DomainException("No se puede rechazar desde {$estadoActual->value}.");
        }
        $solicitud->estado         = EstadoSolicitud::RECHAZADO->value;
        $solicitud->motivo_rechazo = $motivo;
        $solicitud->usuario_aprobador = $usuario->id;
        $solicitud->save();
        return $solicitud;
    }

    /**
     * Resuelve el límite aplicable: usuario > área > rol (más específico gana).
     */
    private function limiteDe(Usuario $usuario, Solicitud $solicitud): float
    {
        $limite = LimiteAprobacion::query()
            ->where('activo', true)
            ->where(function ($q) use ($usuario, $solicitud) {
                $q->where('usuario_id', $usuario->id)
                  ->orWhere(fn ($q2) => $q2->whereNull('usuario_id')->where('area_id', $solicitud->area_id))
                  ->orWhere(fn ($q3) => $q3->whereNull('usuario_id')->whereNull('area_id')->where('rol', $usuario->rol));
            })
            ->orderByRaw('CASE WHEN usuario_id IS NOT NULL THEN 0 WHEN area_id IS NOT NULL THEN 1 ELSE 2 END')
            ->first();

        return (float) ($limite?->monto_maximo ?? 0);
    }
}

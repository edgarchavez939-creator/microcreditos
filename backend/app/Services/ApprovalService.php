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
     * Decide el estado inicial de una solicitud recién creada según el monto solicitado
     * y los límites vigentes en Parámetros. Regla:
     *  - monto <= máximo del supervisor  => PENDIENTE_SUPERVISOR (aprueba supervisor o admin)
     *  - monto  > máximo del supervisor  => PENDIENTE_ADMINISTRADOR (solo admin)
     *  - exoneración de seguro           => siempre PENDIENTE_ADMINISTRADOR
     * Nunca usa valores fijos: lee el parámetro configurable.
     */
    public function estadoInicial(float $montoSolicitado, bool $exonerado): string
    {
        if ($exonerado) {
            return EstadoSolicitud::PENDIENTE_ADMINISTRADOR->value;
        }
        $maxSupervisor = (float) \App\Models\Parametro::valor('aprobacion.max_supervisor', 2000000);
        return $montoSolicitado > $maxSupervisor
            ? EstadoSolicitud::PENDIENTE_ADMINISTRADOR->value
            : EstadoSolicitud::PENDIENTE_SUPERVISOR->value;
    }

    /** Límite vigente para un rol (para auditoría y validaciones externas). */
    public function limiteVigente(string $rol): float
    {
        $clave = $rol === 'ADMINISTRADOR' ? 'aprobacion.max_administrador' : 'aprobacion.max_supervisor';
        $porDefecto = $rol === 'ADMINISTRADOR' ? 50000000 : 2000000;
        return (float) \App\Models\Parametro::valor($clave, $porDefecto);
    }

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
            // El supervisor no puede tocar solicitudes escaladas a administrador.
            if ($estadoActual === EstadoSolicitud::PENDIENTE_ADMINISTRADOR) {
                throw new DomainException(
                    'Esta solicitud supera el monto máximo autorizado para su perfil. Debe ser aprobada por un Administrador.'
                );
            }
            if ($estadoActual !== EstadoSolicitud::PENDIENTE_SUPERVISOR) {
                throw new DomainException('La solicitud no está pendiente de supervisor.');
            }
            $limite = $this->limiteDe($aprobador, $solicitud);
            if ((float) $solicitud->monto_aprobado > $limite) {
                throw new DomainException(
                    'Esta solicitud supera el monto máximo autorizado para su perfil. Debe ser aprobada por un Administrador.'
                );
            }
        } elseif ($aprobador->rol === 'ADMINISTRADOR') {
            if (! in_array($estadoActual, [
                EstadoSolicitud::PENDIENTE_SUPERVISOR,
                EstadoSolicitud::PENDIENTE_ADMINISTRADOR,
            ], true)) {
                throw new DomainException('La solicitud no está en un estado aprobable.');
            }
            $limite = $this->limiteDe($aprobador, $solicitud);
            if ((float) $solicitud->monto_aprobado > $limite) {
                throw new DomainException(
                    'El monto supera el máximo aprobable por el administrador ($' . number_format($limite, 0, ',', '.') . '). Ajusta el parámetro si es necesario.'
                );
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
            // Número de crédito único y no editable (CR-000123)
            if (empty($solicitud->numero_credito)) {
                $solicitud->numero_credito = 'CR-' . str_pad((string) $solicitud->id, 6, '0', STR_PAD_LEFT);
            }
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

        if ($limite) {
            return (float) $limite->monto_maximo;
        }

        // Sin registro específico: usar el parámetro general por rol
        $clave = $usuario->rol === 'ADMINISTRADOR' ? 'aprobacion.max_administrador' : 'aprobacion.max_supervisor';
        $porDefecto = $usuario->rol === 'ADMINISTRADOR' ? 50000000 : 2000000;
        return (float) \App\Models\Parametro::valor($clave, $porDefecto);
    }
}

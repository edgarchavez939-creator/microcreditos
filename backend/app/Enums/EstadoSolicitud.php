<?php

namespace App\Enums;

enum EstadoSolicitud: string
{
    case BORRADOR                  = 'BORRADOR';
    case PENDIENTE_SUPERVISOR      = 'PENDIENTE_SUPERVISOR';
    case PENDIENTE_ADMINISTRADOR   = 'PENDIENTE_ADMINISTRADOR';
    case APROBADO                  = 'APROBADO';
    case RECHAZADO                 = 'RECHAZADO';
    case DESEMBOLSADO              = 'DESEMBOLSADO';
    case ACTIVO                    = 'ACTIVO';
    case FINALIZADO                = 'FINALIZADO';
    case CASTIGADO                 = 'CASTIGADO';
    // Estados de la capa de amortización
    case PAGADO                    = 'PAGADO';
    case EN_MORA                   = 'EN_MORA';
    case REAMORTIZADO              = 'REAMORTIZADO';
    case REFINANCIADO              = 'REFINANCIADO';
    case CANCELADO                 = 'CANCELADO';

    /** Estados históricos: no pueden modificarse una vez alcanzados. */
    public static function historicos(): array
    {
        return ['REAMORTIZADO', 'REFINANCIADO', 'PAGADO', 'CANCELADO'];
    }

    /** ¿El crédito está abierto y por tanto reamortizable? */
    public function esReamortizable(): bool
    {
        return in_array($this, [self::DESEMBOLSADO, self::ACTIVO, self::EN_MORA], true);
    }

    /** @return array<int, EstadoSolicitud> */
    public function siguientesPermitidos(): array
    {
        return match ($this) {
            self::BORRADOR                => [self::PENDIENTE_SUPERVISOR, self::PENDIENTE_ADMINISTRADOR],
            self::PENDIENTE_SUPERVISOR    => [self::APROBADO, self::RECHAZADO, self::PENDIENTE_ADMINISTRADOR],
            self::PENDIENTE_ADMINISTRADOR => [self::APROBADO, self::RECHAZADO],
            self::APROBADO                => [self::DESEMBOLSADO],
            self::DESEMBOLSADO            => [self::ACTIVO, self::REAMORTIZADO],
            self::ACTIVO                  => [self::FINALIZADO, self::CASTIGADO, self::PAGADO, self::EN_MORA, self::REAMORTIZADO, self::REFINANCIADO, self::CANCELADO],
            self::EN_MORA                 => [self::ACTIVO, self::PAGADO, self::CASTIGADO, self::REAMORTIZADO, self::REFINANCIADO, self::CANCELADO],
            default                       => [],
        };
    }

    public function puedeTransicionarA(EstadoSolicitud $destino): bool
    {
        return in_array($destino, $this->siguientesPermitidos(), true);
    }
}

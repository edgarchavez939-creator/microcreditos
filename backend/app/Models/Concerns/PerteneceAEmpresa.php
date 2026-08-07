<?php

namespace App\Models\Concerns;

use App\Services\ContextoEmpresa;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * PERTENENCIA A UNA EMPRESA.
 *
 * Añade dos comportamientos automáticos a un modelo:
 *   · al CREAR, sella el registro con la empresa activa;
 *   · al CONSULTAR, filtra por esa empresa.
 *
 * Es una capa de conveniencia y de claridad, no la defensa principal: el
 * aislamiento real lo impone PostgreSQL con sus políticas, de modo que una
 * consulta que esquive este filtro (SQL crudo, por ejemplo) sigue estando
 * protegida. Aquí lo que se gana es que las consultas sean legibles y que los
 * errores se detecten antes.
 */
trait PerteneceAEmpresa
{
    protected static function bootPerteneceAEmpresa(): void
    {
        // Filtro automático en toda consulta del modelo
        static::addGlobalScope('empresa', function (Builder $q) {
            $id = ContextoEmpresa::id();
            if ($id !== null) {
                $q->where($q->getModel()->getTable() . '.empresa_id', $id);
            }
        });

        // Sellado automático al crear
        static::creating(function (Model $m) {
            if (empty($m->empresa_id) && ContextoEmpresa::id() !== null) {
                $m->empresa_id = ContextoEmpresa::id();
            }
        });
    }

    /** Consulta sin el filtro de empresa. Solo para procesos de plataforma. */
    public static function sinFiltroEmpresa(): Builder
    {
        return static::withoutGlobalScope('empresa');
    }
}

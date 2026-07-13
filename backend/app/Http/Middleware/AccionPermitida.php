<?php

namespace App\Http\Middleware;

use App\Services\PermisoService;
use Closure;
use Illuminate\Http\Request;

/**
 * Enforcement de permisos por ACCIÓN en las rutas (motor de autorizaciones).
 * Uso: ->middleware('accion:pagos.anular')
 * Toda denegación queda auditada por el punto único del PermisoService.
 */
class AccionPermitida
{
    public function __construct(private PermisoService $permisos) {}

    public function handle(Request $request, Closure $next, string $accion)
    {
        $this->permisos->exigir($request, $accion);
        return $next($request);
    }
}

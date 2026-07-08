<?php

namespace App\Http\Middleware;

use App\Services\PermisoService;
use Closure;
use Illuminate\Http\Request;

class ModuloPermitido
{
    public function __construct(private PermisoService $permisos) {}

    public function handle(Request $request, Closure $next, string $modulo)
    {
        $u = $request->user();
        abort_unless($u && $this->permisos->permite($u, $modulo), 403,
            'No tienes habilitado este módulo. Contacta al administrador.');

        return $next($request);
    }
}

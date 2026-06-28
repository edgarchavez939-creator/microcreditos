<?php
namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class RoleMiddleware
{
    public function handle(Request $request, Closure $next, string ...$roles)
    {
        $u = $request->user();
        if (! $u || ! in_array($u->rol, $roles, true)) {
            abort(403, 'No autorizado para este recurso.');
        }
        return $next($request);
    }
}

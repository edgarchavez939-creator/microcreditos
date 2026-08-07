<?php

namespace App\Http\Middleware;

use App\Services\ContextoEmpresa;
use Closure;
use Illuminate\Http\Request;

/**
 * Activa el contexto de empresa en cada petición autenticada.
 *
 * Va inmediatamente después de la autenticación y antes de cualquier otro
 * middleware que consulte datos: desde este punto, toda consulta de la petición
 * queda restringida a la empresa del usuario por las políticas de la base de datos.
 *
 * También bloquea el acceso a empresas suspendidas: una empresa que dejó de
 * pagar o fue dada de baja no puede seguir operando.
 */
class ContextoEmpresaMiddleware
{
    public function handle(Request $request, Closure $next)
    {
        $u = $request->user();

        if ($u) {
            ContextoEmpresa::establecerDesde($u);
            ContextoEmpresa::confirmar();

            // Estado de la empresa (no aplica al administrador global)
            if (! $u->esAdminGlobal() && $u->empresa_id) {
                $estado = \Illuminate\Support\Facades\DB::table('empresas')
                    ->where('id', $u->empresa_id)->value('estado');

                if ($estado === 'SUSPENDIDA') {
                    abort(423, 'El servicio está suspendido para tu empresa. Comunícate con soporte.');
                }
                if ($estado === 'INACTIVA') {
                    abort(403, 'Esta empresa ya no está activa en la plataforma.');
                }
            }
        }

        $respuesta = $next($request);

        // El contexto no debe sobrevivir a la petición: si el proceso reutiliza
        // la conexión, la siguiente empezaría con la empresa anterior.
        ContextoEmpresa::limpiar();

        return $respuesta;
    }
}

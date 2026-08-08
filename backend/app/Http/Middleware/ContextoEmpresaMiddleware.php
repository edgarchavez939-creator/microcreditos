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
            // Contraseña pendiente de cambio: solo se permite consultar el perfil
            // y cambiarla. Sin este corte, la marca sería una sugerencia y el
            // usuario seguiría operando con la clave que le puso otra persona.
            if ($u->debe_cambiar_password
                && ! $request->is('api/auth/password', 'api/auth/me', 'api/auth/logout')) {
                abort(428, 'Debes cambiar tu contraseña antes de continuar.');
            }

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

                // Licencia vencida: se avisa pero no se corta el acceso de golpe.
                // Cortar el servicio a una empresa que está cobrando en la calle
                // causaría más daño que el impago que se pretende evitar; el
                // bloqueo efectivo es la suspensión, que es una decisión humana.
                $plan = \Illuminate\Support\Facades\DB::table('empresa_planes')
                    ->where('empresa_id', $u->empresa_id)
                    ->first(['estado', 'fecha_vencimiento']);

                if ($plan?->fecha_vencimiento && $plan->fecha_vencimiento < now()->toDateString()) {
                    $respuesta = $next($request);
                    if (method_exists($respuesta, 'header')) {
                        $respuesta->header('X-Licencia-Vencida', $plan->fecha_vencimiento);
                    }
                    ContextoEmpresa::limpiar();
                    return $respuesta;
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

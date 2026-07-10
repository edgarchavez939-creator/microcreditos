<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Bloquea el acceso a la API cuando el modo mantenimiento está activo.
 * Excepciones: el Administrador Funcional (para poder desactivarlo) y las
 * rutas de login y del propio módulo de administración.
 */
class VerificarMantenimiento
{
    public function handle(Request $request, Closure $next)
    {
        // Cache corto para no golpear la BD en cada request
        $mant = Cache::remember('mantenimiento:estado', 30, function () {
            return DB::table('mantenimiento')->where('id', 1)->first();
        });

        if (! $mant || ! $mant->activo) {
            return $next($request);
        }

        // El admin funcional siempre pasa (debe poder desactivarlo)
        $usuario = $request->user();
        if ($usuario && $usuario->esAdminFuncional()) {
            return $next($request);
        }

        // Permitir rutas esenciales: login, refresh, logout y el módulo de administración
        if ($request->is('api/auth/*') || $request->is('api/admin-funcional/*')) {
            return $next($request);
        }

        return response()->json([
            'message' => $mant->mensaje ?: 'El sistema está en mantenimiento. Intenta más tarde.',
            'mantenimiento' => true,
        ], 503);
    }
}

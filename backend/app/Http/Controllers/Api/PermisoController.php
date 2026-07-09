<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\PermisoService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PermisoController extends Controller
{
    /** Matriz de permisos para la pantalla del administrador. */
    public function index(Request $request, PermisoService $svc)
    {
        abort_unless($request->user()->esAdministrador(), 403, 'Solo el administrador gestiona permisos.');

        $modulos = collect(PermisoService::MODULOS)->map(fn ($def, $id) => [
            'id' => $id, 'etiqueta' => $def['etiqueta'], 'defecto' => $def['defecto'],
        ])->values();

        $reglasRol = DB::table('permisos')->whereNull('usuario_id')
            ->get(['modulo', 'rol', 'permitido']);

        // Se califica 'permisos.rol' porque 'usuarios' también tiene columna 'rol'
        // (sin el prefijo, PostgreSQL la considera ambigua en el join).
        $reglasUsuario = DB::table('permisos')->whereNull('permisos.rol')
            ->join('usuarios', 'usuarios.id', '=', 'permisos.usuario_id')
            ->get(['permisos.modulo', 'permisos.usuario_id', 'usuarios.nombre', 'permisos.permitido']);

        return response()->json(['data' => [
            'modulos'         => $modulos,
            'reglas_rol'      => $reglasRol,
            'reglas_usuario'  => $reglasUsuario,
        ]]);
    }

    /** Crea/actualiza una regla de acceso (por rol o por usuario). Efecto inmediato. */
    public function update(Request $request, PermisoService $svc)
    {
        abort_unless($request->user()->esAdministrador(), 403, 'Solo el administrador gestiona permisos.');

        $data = $request->validate([
            'modulo'     => ['required', 'string'],
            'rol'        => ['nullable', \Illuminate\Validation\Rule::in(['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR'])],
            'usuario_id' => ['nullable', 'integer', 'exists:usuarios,id'],
            'permitido'  => ['required', 'boolean'],
        ]);

        $svc->fijar($data['modulo'], $data['rol'] ?? null, $data['usuario_id'] ?? null, $data['permitido']);

        return response()->json(['message' => 'Permiso actualizado.']);
    }

    /** Módulos habilitados para el usuario autenticado (alimenta el menú). */
    public function mios(Request $request, PermisoService $svc)
    {
        return response()->json(['data' => $svc->modulosDe($request->user())]);
    }
}

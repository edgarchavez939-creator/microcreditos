<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Usuario;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class UsuarioController extends Controller
{
    /** Solo el administrador gestiona usuarios. */
    private function soloAdmin(Request $request): void
    {
        abort_unless($request->user()->esAdministrador(), 403, 'Solo el administrador puede gestionar usuarios.');
    }

    public function index(Request $request)
    {
        $this->soloAdmin($request);

        $usuarios = Usuario::with('areas:id,nombre')
            ->orderBy('nombre')
            ->get()
            ->map(fn ($u) => $this->presentar($u));

        return response()->json(['data' => $usuarios]);
    }

    public function store(Request $request)
    {
        $this->soloAdmin($request);

        $data = $request->validate([
            'nombre'   => ['required', 'string', 'max:150'],
            'email'    => ['required', 'email', 'max:180', 'unique:usuarios,email'],
            'password' => ['required', 'string', 'min:10'],
            'rol'      => ['required', Rule::in(['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR'])],
            'telefono' => ['nullable', 'string', 'regex:/^[0-9]{7,10}$/'],
            'areas'    => ['required', 'array', 'min:1'],
            'areas.*'  => ['integer', 'exists:areas,id'],
        ]);

        $usuario = Usuario::create([
            'nombre'   => $data['nombre'],
            'email'    => strtolower($data['email']),
            'password' => Hash::make($data['password']),
            'rol'      => $data['rol'],
            'telefono' => $data['telefono'] ?? null,
            'activo'   => true,
        ]);
        $usuario->areas()->sync($data['areas']);

        return response()->json(['data' => $this->presentar($usuario->load('areas:id,nombre'))], 201);
    }

    public function update(Request $request, Usuario $usuario)
    {
        $this->soloAdmin($request);

        $data = $request->validate([
            'nombre'   => ['sometimes', 'string', 'max:150'],
            'email'    => ['sometimes', 'email', 'max:180', Rule::unique('usuarios', 'email')->ignore($usuario->id)],
            'password' => ['sometimes', 'nullable', 'string', 'min:10'],
            'rol'      => ['sometimes', Rule::in(['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR'])],
            'telefono' => ['sometimes', 'nullable', 'string', 'regex:/^[0-9]{7,10}$/'],
            'activo'   => ['sometimes', 'boolean'],
            'areas'    => ['sometimes', 'array', 'min:1'],
            'areas.*'  => ['integer', 'exists:areas,id'],
        ]);

        // Protecciones: no dejarse a sí mismo sin acceso ni sin rol de administrador
        $esElMismo = (int) $usuario->id === (int) $request->user()->id;
        if ($esElMismo && array_key_exists('activo', $data) && ! $data['activo']) {
            abort(422, 'No puedes desactivar tu propia cuenta.');
        }
        if ($esElMismo && isset($data['rol']) && $data['rol'] !== 'ADMINISTRADOR') {
            abort(422, 'No puedes quitarte a ti mismo el rol de administrador.');
        }

        if (isset($data['email']))    $data['email'] = strtolower($data['email']);
        if (! empty($data['password'])) {
            $data['password'] = Hash::make($data['password']);
        } else {
            unset($data['password']);
        }

        $areas = $data['areas'] ?? null;
        unset($data['areas']);

        $usuario->update($data);
        if ($areas !== null) $usuario->areas()->sync($areas);

        return response()->json(['data' => $this->presentar($usuario->fresh()->load('areas:id,nombre'))]);
    }

    private function presentar(Usuario $u): array
    {
        return [
            'id'       => $u->id,
            'nombre'   => $u->nombre,
            'email'    => $u->email,
            'rol'      => $u->rol,
            'telefono' => $u->telefono,
            'activo'   => (bool) $u->activo,
            'areas'    => $u->areas->map(fn ($a) => ['id' => $a->id, 'nombre' => $a->nombre])->values(),
            'ultimo_login_at' => $u->ultimo_login_at?->toIso8601String(),
        ];
    }
}

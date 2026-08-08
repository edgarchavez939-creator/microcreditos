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
    /**
     * Gestión de usuarios: consulta el MOTOR DE PERMISOS ('usuarios.gestionar'),
     * configurable por el administrador, en lugar de cablear el rol.
     */
    private function soloAdmin(Request $request): void
    {
        $u = $request->user();
        abort_unless(
            $u && ($u->esAdministracion() || app(\App\Services\PermisoService::class)->autoriza($u, 'usuarios.gestionar')),
            403,
            'No tienes permiso para gestionar usuarios.'
        );
    }

    public function index(Request $request)
    {
        $this->soloAdmin($request);

        $usuarios = Usuario::with('areas:id,nombre')
            // El Administrador Funcional es transparente para la operación: solo él se ve a sí mismo.
            ->when(! $request->user()->esAdminFuncional(), fn ($q) => $q->where('rol', '!=', 'ADMIN_FUNCIONAL'))
            ->orderBy('nombre')
            ->get()
            ->map(fn ($u) => $this->presentar($u));

        return response()->json(['data' => $usuarios]);
    }

    public function store(Request $request)
    {
        $this->soloAdmin($request);

        $data = $request->validate([
            'nombres'   => ['required', 'string', 'max:90'],
            'apellidos' => ['required', 'string', 'max:90'],
            'tipo_documento'   => ['nullable', Rule::in(['CC', 'CE', 'TI', 'NIT', 'PASAPORTE'])],
            'numero_documento' => ['nullable', 'string', 'max:40'],
            'email'    => ['required', 'email', 'max:180', 'unique:usuarios,email'],
            'password' => ['required', 'string', 'min:10'],
            'rol'      => ['required', Rule::in(['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR'])],
            'telefono' => ['nullable', 'string', 'regex:/^[0-9]{7,10}$/'],
            'direccion'        => ['nullable', 'string', 'max:200'],
            'fecha_nacimiento' => ['nullable', 'date'],
            'contacto_emergencia_nombre'   => ['nullable', 'string', 'max:120'],
            'contacto_emergencia_telefono' => ['nullable', 'string', 'regex:/^[0-9]{7,10}$/'],
            'salario_base'  => ['nullable', 'numeric', 'gte:0'],
            'banco'         => ['nullable', 'string', 'max:80'],
            'numero_cuenta' => ['nullable', 'string', 'max:40'],
            'areas'    => ['required', 'array', 'min:1'],
            'areas.*'  => ['integer', 'exists:areas,id'],
        ]);

        // Control de licencia: impedir crear usuarios cuando se alcanza el límite configurado.
        $this->validarLimiteLicencia($data['rol']);

        $usuario = Usuario::create([
            // 'nombre' se sincroniza por trigger desde nombres/apellidos
            'nombres'   => $data['nombres'],
            'apellidos' => $data['apellidos'],
            'nombre'    => trim($data['nombres'] . ' ' . $data['apellidos']),
            'tipo_documento'   => $data['tipo_documento'] ?? null,
            'numero_documento' => $data['numero_documento'] ?? null,
            'email'    => strtolower($data['email']),
            'password' => Hash::make($data['password']),
            'rol'      => $data['rol'],
            'telefono' => $data['telefono'] ?? null,
            'direccion'        => $data['direccion'] ?? null,
            'fecha_nacimiento' => $data['fecha_nacimiento'] ?? null,
            'contacto_emergencia_nombre'   => $data['contacto_emergencia_nombre'] ?? null,
            'contacto_emergencia_telefono' => $data['contacto_emergencia_telefono'] ?? null,
            'salario_base'  => $data['salario_base'] ?? null,
            'banco'         => $data['banco'] ?? null,
            'numero_cuenta' => $data['numero_cuenta'] ?? null,
            'activo'   => true,
        ]);
        $usuario->areas()->sync($data['areas']);

        return response()->json(['data' => $this->presentar($usuario->load('areas:id,nombre'))], 201);
    }

    public function update(Request $request, Usuario $usuario)
    {
        $this->soloAdmin($request);

        $data = $request->validate([
            'nombres'   => ['sometimes', 'string', 'max:90'],
            'apellidos' => ['sometimes', 'string', 'max:90'],
            'tipo_documento'   => ['sometimes', 'nullable', Rule::in(['CC', 'CE', 'TI', 'NIT', 'PASAPORTE'])],
            'numero_documento' => ['sometimes', 'nullable', 'string', 'max:40'],
            'email'    => ['sometimes', 'email', 'max:180', Rule::unique('usuarios', 'email')->ignore($usuario->id)],
            'password' => ['sometimes', 'nullable', 'string', 'min:10'],
            'rol'      => ['sometimes', Rule::in(['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR'])],
            'telefono' => ['sometimes', 'nullable', 'string', 'regex:/^[0-9]{7,10}$/'],
            'direccion'        => ['sometimes', 'nullable', 'string', 'max:200'],
            'fecha_nacimiento' => ['sometimes', 'nullable', 'date'],
            'contacto_emergencia_nombre'   => ['sometimes', 'nullable', 'string', 'max:120'],
            'contacto_emergencia_telefono' => ['sometimes', 'nullable', 'string', 'regex:/^[0-9]{7,10}$/'],
            'salario_base'  => ['sometimes', 'nullable', 'numeric', 'gte:0'],
            'banco'         => ['sometimes', 'nullable', 'string', 'max:80'],
            'numero_cuenta' => ['sometimes', 'nullable', 'string', 'max:40'],
            // Correo de Google autorizado para entrar (puede diferir del corporativo).
            // Vaciarlo desvincula la cuenta y obliga a volver a autorizarla.
            'google_email'  => ['sometimes', 'nullable', 'email', 'max:255',
                                Rule::unique('usuarios', 'google_email')->ignore($usuario->id)],
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

        // Vinculación con Google: al cambiar o borrar el correo autorizado se limpia
        // el identificador grabado, de modo que la próxima cuenta deba autorizarse
        // de nuevo. Evita que una vinculación antigua siga dando acceso.
        if (array_key_exists('google_email', $data)) {
            $nuevo = $data['google_email'] ? strtolower($data['google_email']) : null;
            if ($nuevo !== ($usuario->google_email ? strtolower($usuario->google_email) : null)) {
                $data['google_id'] = null;
                $data['google_vinculado_at'] = null;
            }
            $data['google_email'] = $nuevo;
        }
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

    /** Impide crear usuarios si se alcanzó el límite de la licencia (total o por rol). */
    private function validarLimiteLicencia(string $rol): void
    {
        // ---- Plan contratado por la empresa (multi-empresa) ----
        // Manda sobre la licencia interna: es el compromiso comercial con KRYPTA.
        $empresaId = request()->user()?->empresa_id;
        if ($empresaId) {
            $plan = \Illuminate\Support\Facades\DB::table('empresa_planes')
                ->where('empresa_id', $empresaId)->first(['max_usuarios', 'estado']);

            if ($plan?->max_usuarios) {
                $actuales = \Illuminate\Support\Facades\DB::table('usuarios')
                    ->where('empresa_id', $empresaId)->where('activo', true)->count();

                if ($actuales >= $plan->max_usuarios) {
                    abort(422, "Tu plan permite {$plan->max_usuarios} usuarios activos y ya tienes {$actuales}. " .
                        'Desactiva uno o solicita una ampliación del plan.');
                }
            }
        }

        // ---- Licencia interna (comportamiento anterior, se conserva) ----
        $lic = \Illuminate\Support\Facades\DB::table('licencia')->where('id', 1)->first();
        if (! $lic) return; // sin licencia configurada, no se restringe

        if ($lic->estado !== 'ACTIVA') {
            abort(422, 'La licencia no está activa. Contacta al administrador de la plataforma.');
        }
        if ($lic->vence_el && now()->gt(\Carbon\Carbon::parse($lic->vence_el)->endOfDay())) {
            abort(422, 'La licencia está vencida. No se pueden crear más usuarios.');
        }

        $totalActual = \Illuminate\Support\Facades\DB::table('usuarios')->where('activo', true)
            ->where('rol', '!=', 'ADMIN_FUNCIONAL')->count();
        if ($totalActual >= $lic->max_usuarios) {
            abort(422, "Se alcanzó el límite de usuarios de la licencia ({$lic->max_usuarios}).");
        }

        $porRol = [
            'ADMINISTRADOR' => $lic->max_administradores,
            'SUPERVISOR'    => $lic->max_supervisores,
            'COBRADOR'      => $lic->max_cobradores,
        ];
        if (isset($porRol[$rol])) {
            $actualRol = \Illuminate\Support\Facades\DB::table('usuarios')->where('activo', true)->where('rol', $rol)->count();
            if ($actualRol >= $porRol[$rol]) {
                $etiqueta = ['ADMINISTRADOR' => 'administradores', 'SUPERVISOR' => 'supervisores', 'COBRADOR' => 'cobradores'][$rol];
                abort(422, "Se alcanzó el límite de {$etiqueta} de la licencia ({$porRol[$rol]}).");
            }
        }
    }

    private function presentar(Usuario $u): array
    {
        return [
            'id'       => $u->id,
            'nombre'   => $u->nombre,
            'nombres'  => $u->nombres,
            'apellidos'=> $u->apellidos,
            'tipo_documento'   => $u->tipo_documento,
            'numero_documento' => $u->numero_documento,
            'email'    => $u->email,
            'google_email'        => $u->google_email,
            'google_vinculado'    => (bool) $u->google_id,
            'google_vinculado_at' => $u->google_vinculado_at,
            'rol'      => $u->rol,
            'telefono' => $u->telefono,
            'direccion'        => $u->direccion,
            'fecha_nacimiento' => $u->fecha_nacimiento,
            'contacto_emergencia_nombre'   => $u->contacto_emergencia_nombre,
            'contacto_emergencia_telefono' => $u->contacto_emergencia_telefono,
            'salario_base'  => $u->salario_base !== null ? (float) $u->salario_base : null,
            'banco'         => $u->banco,
            'numero_cuenta' => $u->numero_cuenta,
            'activo'   => (bool) $u->activo,
            'areas'    => $u->areas->map(fn ($a) => ['id' => $a->id, 'nombre' => $a->nombre])->values(),
            'ultimo_login_at' => $u->ultimo_login_at?->toIso8601String(),
        ];
    }
}

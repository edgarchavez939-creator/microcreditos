<?php
namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UsuarioResource;
use App\Services\AuthService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function __construct(private AuthService $auth) {}

    public function login(Request $request)
    {
        $data = $request->validate([
            'email'    => ['required','email'],
            'password' => ['required','string'],
            'otp'      => ['nullable','string'],
        ]);

        $r = $this->auth->login(
            $data['email'], $data['password'], $data['otp'] ?? null,
            $request->ip(), $request->userAgent()
        );

        return response()->json([
            'access_token'  => $r['access_token'],
            'refresh_token' => $r['refresh_token'],
            'token_type'    => 'bearer',
            'expires_in'    => $r['expires_in'],
            'usuario'       => new UsuarioResource($r['usuario']),
        ]);
    }

    /**
     * Ingreso con Google. Recibe el id_token que emite el navegador y, si la
     * cuenta está autorizada, devuelve la misma sesión que el login normal.
     */
    public function loginGoogle(Request $request, \App\Services\GoogleAuthService $google)
    {
        $data = $request->validate([
            'id_token' => ['required', 'string', 'max:4096'],
            'otp'      => ['nullable', 'string'],
        ]);

        $tokens = $google->login(
            $data['id_token'],
            $request->ip(),
            substr((string) $request->userAgent(), 0, 255),
            $data['otp'] ?? null,
        );

        return response()->json($tokens);
    }

    /**
     * Cambio de contraseña del propio usuario.
     * Es la única vía para levantar la marca de cambio obligatorio: el
     * administrador no puede hacerlo por él, que es justamente el punto.
     */
    public function cambiarPassword(Request $request)
    {
        $data = $request->validate([
            'password_actual' => ['required', 'string'],
            'password_nueva'  => ['required', 'string', 'min:10', 'confirmed'],
        ]);

        $u = $request->user();

        if (! \Illuminate\Support\Facades\Hash::check($data['password_actual'], $u->password)) {
            return response()->json(['message' => 'La contraseña actual no es correcta.'], 422);
        }
        if (\Illuminate\Support\Facades\Hash::check($data['password_nueva'], $u->password)) {
            return response()->json(['message' => 'La contraseña nueva debe ser distinta de la actual.'], 422);
        }

        // Requisitos mínimos: longitud y variedad. Se explican en el mensaje para
        // que el usuario sepa qué corregir, en vez de recibir un rechazo opaco.
        $n = $data['password_nueva'];
        if (! preg_match('/[A-Za-z]/', $n) || ! preg_match('/\d/', $n)) {
            return response()->json([
                'message' => 'La contraseña debe tener al menos 10 caracteres, con letras y números.',
            ], 422);
        }

        $u->forceFill([
            'password' => \Illuminate\Support\Facades\Hash::make($n),
            'debe_cambiar_password' => false,
            'password_cambiado_at' => now(),
        ])->save();

        \Illuminate\Support\Facades\DB::table('auditoria')->insert([
            'empresa_id' => $u->empresa_id,
            'usuario_id' => $u->id,
            'accion' => 'PASSWORD_CAMBIADA',
            'entidad' => 'usuario', 'entidad_id' => $u->id,
            'ip' => $request->ip(), 'created_at' => now(),
        ]);

        return response()->json(['message' => 'Contraseña actualizada.']);
    }

    public function refresh(Request $request)
    {
        $data = $request->validate(['refresh_token' => ['required','string']]);
        $r = $this->auth->refresh($data['refresh_token'], $request->ip(), $request->userAgent());
        return response()->json([
            'access_token'  => $r['access_token'],
            'refresh_token' => $r['refresh_token'],
            'token_type'    => 'bearer',
            'expires_in'    => $r['expires_in'],
        ]);
    }

    public function me(Request $request)
    {
        return new UsuarioResource($request->user());
    }

    public function logout(Request $request)
    {
        $this->auth->logout($request->user());
        return response()->json(['message' => 'Sesión cerrada.']);
    }
}

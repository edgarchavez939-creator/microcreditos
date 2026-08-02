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

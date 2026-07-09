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

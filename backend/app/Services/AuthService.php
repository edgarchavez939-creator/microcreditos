<?php

namespace App\Services;

use App\Models\Parametro;
use App\Models\RefreshToken;
use App\Models\Usuario;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use PragmaRX\Google2FA\Google2FA;
use Tymon\JWTAuth\Facades\JWTAuth;

class AuthService
{
    public function __construct(private Google2FA $google2fa = new Google2FA()) {}

    /**
     * Autentica credenciales. Aplica bloqueo por intentos fallidos.
     * @return array{access_token:string, refresh_token:string, expires_in:int, usuario:Usuario}
     */
    public function login(string $email, string $password, ?string $otp, string $ip, ?string $ua): array
    {
        $usuario = Usuario::where('email', $email)->first();

        if (! $usuario || ! $usuario->activo) {
            abort(401, 'Credenciales inválidas.');
        }
        if ($usuario->estaBloqueado()) {
            abort(423, 'Cuenta bloqueada temporalmente por intentos fallidos.');
        }
        if (! Hash::check($password, $usuario->password)) {
            $this->registrarFallo($usuario);
            abort(401, 'Credenciales inválidas.');
        }
        if ($usuario->twofa_enabled) {
            if (! $otp || ! $this->google2fa->verifyKey($usuario->twofa_secret, $otp)) {
                abort(401, 'Código 2FA inválido o requerido.');
            }
        }

        // Reset de intentos y registro de login
        $usuario->forceFill([
            'intentos_fallidos' => 0,
            'bloqueado_hasta'   => null,
            'ultimo_login_at'   => now(),
            'ultimo_login_ip'   => $ip,
        ])->save();

        return $this->emitirTokens($usuario, $ip, $ua);
    }

    /**
     * Rota el refresh token: revoca el anterior y emite uno nuevo.
     */
    public function refresh(string $refreshToken, string $ip, ?string $ua): array
    {
        $hash = hash('sha256', $refreshToken);
        $registro = RefreshToken::where('token_hash', $hash)
            ->where('revocado', false)
            ->where('expira_at', '>', now())
            ->first();

        if (! $registro) {
            abort(401, 'Refresh token inválido o expirado.');
        }

        $registro->update(['revocado' => true]); // rotación
        $usuario = Usuario::findOrFail($registro->usuario_id);

        return $this->emitirTokens($usuario, $ip, $ua);
    }

    public function logout(Usuario $usuario): void
    {
        RefreshToken::where('usuario_id', $usuario->id)
            ->where('revocado', false)->update(['revocado' => true]);
        JWTAuth::invalidate(JWTAuth::getToken());
    }

    private function emitirTokens(Usuario $usuario, string $ip, ?string $ua): array
    {
        $access = JWTAuth::fromUser($usuario);
        $plain  = Str::random(80);

        RefreshToken::create([
            'usuario_id' => $usuario->id,
            'token_hash' => hash('sha256', $plain),
            'expira_at'  => now()->addMinutes((int) config('jwt.refresh_ttl', 20160)),
            'ip'         => $ip,
            'user_agent' => $ua,
        ]);

        return [
            'access_token'  => $access,
            'refresh_token' => $plain,
            'expires_in'    => (int) config('jwt.ttl', 15) * 60,
            'usuario'       => $usuario,
        ];
    }

    private function registrarFallo(Usuario $usuario): void
    {
        $max = (int) Parametro::valor('auth.max_intentos', 5);
        $min = (int) Parametro::valor('auth.bloqueo_minutos', 15);

        $usuario->increment('intentos_fallidos');
        if ($usuario->intentos_fallidos >= $max) {
            $usuario->update(['bloqueado_hasta' => now()->addMinutes($min)]);
        }
    }
}

<?php

namespace App\Services;

use App\Models\Usuario;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * INICIO DE SESIÓN CON GOOGLE.
 *
 * Flujo: el navegador obtiene un id_token firmado por Google → aquí se valida →
 * se busca el usuario YA REGISTRADO que corresponda → se emiten los tokens JWT
 * propios del sistema. El motor de permisos, roles y áreas no cambia en nada.
 *
 * REGLA DE SEGURIDAD CENTRAL: Google solo sirve para *demostrar identidad*, nunca
 * para crear cuentas. Si el correo de Google no corresponde a un usuario activo
 * previamente dado de alta por el administrador, el acceso se rechaza. Sin esto,
 * cualquier persona con una cuenta Gmail entraría al sistema financiero.
 */
class GoogleAuthService
{
    /** Endpoint oficial de validación de Google. */
    private const TOKENINFO = 'https://oauth2.googleapis.com/tokeninfo';

    /** Emisores válidos del id_token. */
    private const EMISORES = ['accounts.google.com', 'https://accounts.google.com'];

    public function __construct(
        private AuthService $auth,
        private \PragmaRX\Google2FA\Google2FA $google2fa = new \PragmaRX\Google2FA\Google2FA(),
    ) {}

    /**
     * Valida el id_token contra Google y devuelve sus datos verificados.
     * Lanza abort(401) ante cualquier inconsistencia.
     */
    public function verificarToken(string $idToken): array
    {
        $clientId = (string) config('services.google.client_id');
        if ($clientId === '') {
            Log::error('Login Google: falta GOOGLE_CLIENT_ID en la configuración.');
            abort(503, 'El ingreso con Google no está configurado en el servidor.');
        }

        try {
            $resp = Http::timeout(8)->get(self::TOKENINFO, ['id_token' => $idToken]);
        } catch (\Throwable $e) {
            Log::warning('Login Google: no se pudo contactar a Google. ' . $e->getMessage());
            abort(503, 'No se pudo verificar la cuenta con Google. Intenta de nuevo o entra con tu contraseña.');
        }

        if (! $resp->successful()) {
            abort(401, 'La sesión de Google no es válida o expiró. Vuelve a intentarlo.');
        }

        $d = $resp->json();

        // --- Validaciones explícitas (no se delegan) ---

        // 1) Audiencia: el token debe haber sido emitido PARA esta aplicación.
        //    Sin esta comprobación, un token válido de otra app sería aceptado.
        if (($d['aud'] ?? null) !== $clientId) {
            Log::warning('Login Google: audiencia incorrecta.', ['aud' => $d['aud'] ?? null]);
            abort(401, 'La sesión de Google no corresponde a esta aplicación.');
        }

        // 2) Emisor
        if (! in_array($d['iss'] ?? '', self::EMISORES, true)) {
            abort(401, 'El emisor de la sesión de Google no es válido.');
        }

        // 3) Expiración
        if ((int) ($d['exp'] ?? 0) < time()) {
            abort(401, 'La sesión de Google expiró. Vuelve a intentarlo.');
        }

        // 4) Correo verificado por Google
        $email = strtolower(trim((string) ($d['email'] ?? '')));
        $verificado = filter_var($d['email_verified'] ?? false, FILTER_VALIDATE_BOOLEAN);
        if ($email === '' || ! $verificado) {
            abort(401, 'La cuenta de Google no tiene un correo verificado.');
        }

        // 5) Identificador estable
        $sub = (string) ($d['sub'] ?? '');
        if ($sub === '') {
            abort(401, 'La sesión de Google no incluye un identificador válido.');
        }

        return ['sub' => $sub, 'email' => $email, 'nombre' => (string) ($d['name'] ?? '')];
    }

    /**
     * Ingreso completo con Google: valida, localiza al usuario autorizado y emite
     * los tokens del sistema.
     */
    public function login(string $idToken, string $ip, ?string $ua, ?string $otp = null): array
    {
        $g = $this->verificarToken($idToken);

        $usuario = $this->localizarUsuario($g['sub'], $g['email']);

        if (! $usuario) {
            // Mensaje deliberadamente claro para el usuario legítimo, sin revelar
            // si el correo existe o no en el sistema.
            $this->auditar(null, 'LOGIN_GOOGLE_RECHAZADO', $ip, ['email_google' => $g['email']]);
            abort(403, 'Esta cuenta de Google no está autorizada. Pide al administrador que vincule tu correo de Google a tu usuario.');
        }

        if (! $usuario->activo) {
            $this->auditar($usuario->id, 'LOGIN_GOOGLE_INACTIVO', $ip, ['email_google' => $g['email']]);
            abort(403, 'Tu usuario está inactivo. Comunícate con el administrador.');
        }

        if ($usuario->estaBloqueado()) {
            abort(423, 'Cuenta bloqueada temporalmente por intentos fallidos.');
        }

        // El segundo factor se respeta también con Google: si el administrador lo
        // activó para este usuario, se sigue exigiendo.
        if ($usuario->twofa_enabled) {
            if (! $otp || ! $this->google2fa->verifyKey($usuario->twofa_secret, $otp)) {
                abort(401, 'Código 2FA inválido o requerido.');
            }
        }

        // Primer ingreso: se graba el identificador estable de Google.
        $cambios = [
            'intentos_fallidos' => 0,
            'bloqueado_hasta'   => null,
            'ultimo_login_at'   => now(),
            'ultimo_login_ip'   => $ip,
        ];
        if (! $usuario->google_id) {
            $cambios['google_id'] = $g['sub'];
            $cambios['google_email'] = $g['email'];
            $cambios['google_vinculado_at'] = now();
        }
        $usuario->forceFill($cambios)->save();

        $this->auditar($usuario->id, 'LOGIN_GOOGLE', $ip, ['email_google' => $g['email']]);

        return $this->auth->emitirTokens($usuario, $ip, $ua);
    }

    /**
     * Busca al usuario autorizado para esta cuenta de Google, en orden de confianza:
     *   1) google_id (identificador estable: sobrevive a cambios de correo);
     *   2) google_email vinculado por el administrador;
     *   3) email del sistema, si coincide con el de Google.
     * Nunca crea usuarios.
     */
    private function localizarUsuario(string $sub, string $email): ?Usuario
    {
        $porId = Usuario::where('google_id', $sub)->first();
        if ($porId) return $porId;

        $porVinculo = Usuario::whereRaw('LOWER(google_email) = ?', [$email])->first();
        if ($porVinculo) return $porVinculo;

        return Usuario::whereRaw('LOWER(email) = ?', [$email])->first();
    }

    private function auditar(?int $usuarioId, string $accion, string $ip, array $datos): void
    {
        DB::table('auditoria')->insert([
            'usuario_id'   => $usuarioId,
            'accion'       => $accion,
            'entidad'      => 'usuario',
            'entidad_id'   => $usuarioId,
            'datos_nuevos' => json_encode($datos, JSON_UNESCAPED_UNICODE),
            'ip'           => $ip,
            'created_at'   => now(),
        ]);
    }
}

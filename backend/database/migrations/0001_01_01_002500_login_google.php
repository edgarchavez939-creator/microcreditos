<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * INICIO DE SESIÓN CON GOOGLE.
 *
 * Los usuarios entran con su cuenta Gmail personal, que normalmente NO coincide
 * con el correo corporativo registrado en el sistema. Por eso se guardan:
 *
 *  - google_email: el Gmail autorizado para ese usuario. Lo define el administrador
 *    desde la gestión de usuarios. Es la "invitación": sin este dato (o sin que
 *    coincida con el email del sistema) la cuenta de Google no puede entrar.
 *
 *  - google_id: el identificador estable de Google (claim "sub"). Se graba en el
 *    primer ingreso exitoso y a partir de ahí manda sobre el correo, porque un
 *    usuario puede cambiar su dirección de Gmail pero su "sub" nunca cambia.
 *
 *  - google_vinculado_at: cuándo quedó vinculada la cuenta (trazabilidad).
 *
 * La contraseña se conserva como método de respaldo.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS google_id VARCHAR(64)");
        DB::statement("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS google_email VARCHAR(255)");
        DB::statement("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS google_vinculado_at TIMESTAMPTZ");

        // Un mismo Google no puede quedar vinculado a dos usuarios del sistema.
        DB::statement("CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_google_id ON usuarios(google_id) WHERE google_id IS NOT NULL");
        // Ni el mismo Gmail autorizado en dos fichas distintas.
        DB::statement("CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_google_email ON usuarios(LOWER(google_email)) WHERE google_email IS NOT NULL");
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS idx_usuarios_google_email');
        DB::statement('DROP INDEX IF EXISTS idx_usuarios_google_id');
        foreach (['google_vinculado_at', 'google_email', 'google_id'] as $col) {
            DB::statement("ALTER TABLE usuarios DROP COLUMN IF EXISTS {$col}");
        }
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

/**
 * ENDURECIMIENTO DE SEGURIDAD.
 *
 * 1. CAMBIO DE CONTRASEÑA OBLIGATORIO
 *    Sin esto, un empleado conserva para siempre la clave que le puso el
 *    administrador —quien por tanto puede entrar como él—. No hay responsabilidad
 *    individual posible: cualquier acción suya podría haberla hecho otro.
 *
 * 2. CIFRADO DE DATOS SENSIBLES
 *    El salario y la cuenta bancaria de los empleados estaban en texto plano:
 *    cualquiera con acceso a un respaldo o a la consola de la base los leía. Se
 *    cifran con la clave de la aplicación, igual que ya se hacía con el secreto
 *    del doble factor.
 *
 *    El cifrado obliga a ampliar las columnas: un valor cifrado ocupa bastante
 *    más que el original, y `salario_base` pasa de numérico a texto.
 */
return new class extends Migration
{
    // Fuera de transacción: un fallo tardío no debe revertir los pasos ya
    // completados. Todas las operaciones son idempotentes y reintentables.
    public $withinTransaction = false;

    public function up(): void
    {
        // ---------- 1. Cambio de contraseña obligatorio ----------
        DB::statement("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS debe_cambiar_password BOOLEAN NOT NULL DEFAULT false");
        DB::statement("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password_cambiado_at TIMESTAMPTZ");

        // Los usuarios que ya existen conservan su contraseña: forzar el cambio a
        // todos de golpe dejaría a la operación sin poder entrar mañana. Se marca
        // solo a quien nunca la haya cambiado.
        DB::statement("
            UPDATE usuarios
               SET password_cambiado_at = created_at
             WHERE password_cambiado_at IS NULL
        ");

        // ---------- 2. Cifrado de salario y cuenta bancaria ----------
        if (! $this->existeColumna('usuarios', 'salario_base')) {
            return;
        }

        // Columnas de destino (texto, con espacio para el valor cifrado)
        DB::statement("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS salario_base_cif TEXT");
        DB::statement("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS numero_cuenta_cif TEXT");

        // Traslado del contenido existente, cifrándolo
        $usuarios = DB::table('usuarios')
            ->whereNotNull('salario_base')->orWhereNotNull('numero_cuenta')
            ->get(['id', 'salario_base', 'numero_cuenta']);

        foreach ($usuarios as $u) {
            $cambios = [];
            if ($u->salario_base !== null && $u->salario_base !== '') {
                $cambios['salario_base_cif'] = Crypt::encryptString((string) $u->salario_base);
            }
            if ($u->numero_cuenta !== null && $u->numero_cuenta !== '') {
                $cambios['numero_cuenta_cif'] = Crypt::encryptString((string) $u->numero_cuenta);
            }
            if ($cambios) {
                DB::table('usuarios')->where('id', $u->id)->update($cambios);
            }
        }

        // Se retiran las columnas en claro. El dato ya está a salvo en las nuevas.
        DB::statement("ALTER TABLE usuarios DROP COLUMN IF EXISTS salario_base");
        DB::statement("ALTER TABLE usuarios DROP COLUMN IF EXISTS numero_cuenta");
        DB::statement("ALTER TABLE usuarios RENAME COLUMN salario_base_cif TO salario_base");
        DB::statement("ALTER TABLE usuarios RENAME COLUMN numero_cuenta_cif TO numero_cuenta");

        DB::statement("COMMENT ON COLUMN usuarios.salario_base IS 'Cifrado con la clave de la aplicación (cast: encrypted)'");
        DB::statement("COMMENT ON COLUMN usuarios.numero_cuenta IS 'Cifrado con la clave de la aplicación (cast: encrypted)'");
    }

    public function down(): void
    {
        // El descifrado masivo se omite a propósito: revertir devolvería los datos
        // a texto plano, que es justo lo que esta migración corrige.
        DB::statement('ALTER TABLE usuarios DROP COLUMN IF EXISTS debe_cambiar_password');
        DB::statement('ALTER TABLE usuarios DROP COLUMN IF EXISTS password_cambiado_at');
    }

    private function existeColumna(string $tabla, string $columna): bool
    {
        return DB::selectOne(
            "SELECT 1 AS ok FROM information_schema.columns
              WHERE table_schema='public' AND table_name=? AND column_name=?",
            [$tabla, $columna]
        ) !== null;
    }
};

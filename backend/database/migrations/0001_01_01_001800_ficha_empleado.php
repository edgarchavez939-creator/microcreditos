<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Ficha completa del empleado (usuarios).
 *
 * Añade identificación, contacto, datos laborales y financieros. Estrategia de
 * compatibilidad: se conserva la columna `nombre` (usada en 40+ lugares del sistema).
 * Cuando existan nombres/apellidos, `nombre` se mantiene sincronizado por trigger
 * como "nombres apellidos", de modo que TODO el código existente sigue funcionando
 * sin cambios (reportes, auditoría, joins, selects). Migración integral y sin regresión.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach ([
            // Identificación
            'nombres'              => 'VARCHAR(90)',
            'apellidos'            => 'VARCHAR(90)',
            'tipo_documento'      => 'VARCHAR(15)',        // CC | CE | TI | NIT | PASAPORTE
            'numero_documento'    => 'VARCHAR(40)',
            // Contacto
            'direccion'           => 'VARCHAR(200)',
            'fecha_nacimiento'    => 'DATE',
            'contacto_emergencia_nombre'   => 'VARCHAR(120)',
            'contacto_emergencia_telefono' => 'VARCHAR(30)',
            // Laboral
            'salario_base'        => 'NUMERIC(16,2)',
            // Financiero (para nómina y estado de cuenta)
            'banco'               => 'VARCHAR(80)',
            'numero_cuenta'       => 'VARCHAR(40)',
        ] as $col => $tipo) {
            DB::statement("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS {$col} {$tipo}");
        }

        // Backfill: separar el `nombre` actual en nombres/apellidos (primera palabra =
        // nombres; el resto = apellidos), solo donde aún no se haya capturado.
        DB::statement("
            UPDATE usuarios SET
                nombres = COALESCE(nombres, split_part(nombre, ' ', 1)),
                apellidos = COALESCE(apellidos, NULLIF(substr(nombre, length(split_part(nombre, ' ', 1)) + 2), ''))
            WHERE nombres IS NULL
        ");

        // Trigger: mantener `nombre` = "nombres apellidos" siempre que se capturen.
        // Así el resto del sistema (que lee `nombre`) no requiere cambio alguno.
        DB::statement("
            CREATE OR REPLACE FUNCTION sync_usuario_nombre() RETURNS trigger AS \$\$
            BEGIN
                IF NEW.nombres IS NOT NULL THEN
                    NEW.nombre := trim(NEW.nombres || ' ' || COALESCE(NEW.apellidos, ''));
                END IF;
                RETURN NEW;
            END;
            \$\$ LANGUAGE plpgsql
        ");
        DB::statement('DROP TRIGGER IF EXISTS trg_sync_usuario_nombre ON usuarios');
        DB::statement("
            CREATE TRIGGER trg_sync_usuario_nombre
            BEFORE INSERT OR UPDATE OF nombres, apellidos ON usuarios
            FOR EACH ROW EXECUTE FUNCTION sync_usuario_nombre()
        ");
    }

    public function down(): void
    {
        DB::statement('DROP TRIGGER IF EXISTS trg_sync_usuario_nombre ON usuarios');
        DB::statement('DROP FUNCTION IF EXISTS sync_usuario_nombre()');
        foreach ([
            'nombres', 'apellidos', 'tipo_documento', 'numero_documento', 'direccion',
            'fecha_nacimiento', 'contacto_emergencia_nombre', 'contacto_emergencia_telefono',
            'salario_base', 'banco', 'numero_cuenta',
        ] as $col) {
            DB::statement("ALTER TABLE usuarios DROP COLUMN IF EXISTS {$col}");
        }
    }
};

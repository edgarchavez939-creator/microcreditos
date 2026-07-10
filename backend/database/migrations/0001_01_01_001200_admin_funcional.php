<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Cimiento del rol Administrador Funcional (super-admin técnico):
 * - Agrega el valor al enum de roles (oculto para admins normales a nivel de app).
 * - Tabla feature_flags: activar/ocultar módulos sin tocar código.
 * - Tabla licencia: límites de usuarios por rol y estado de licencia.
 * Todo idempotente y sin afectar datos existentes.
 */
return new class extends Migration
{
    // ALTER TYPE ... ADD VALUE no puede correr dentro de una transacción en Postgres.
    public $withinTransaction = false;

    public function up(): void
    {
        // 1) Agregar el rol al enum (Postgres: ADD VALUE IF NOT EXISTS). Fuera de transacción.
        DB::statement("ALTER TYPE rol_usuario ADD VALUE IF NOT EXISTS 'ADMIN_FUNCIONAL'");

        // 2) Feature flags: control de módulos/funcionalidades en runtime
        DB::statement("
            CREATE TABLE IF NOT EXISTS feature_flags (
                id BIGSERIAL PRIMARY KEY,
                clave VARCHAR(80) UNIQUE NOT NULL,
                etiqueta VARCHAR(160) NOT NULL,
                descripcion TEXT,
                activo BOOLEAN NOT NULL DEFAULT true,
                en_pruebas BOOLEAN NOT NULL DEFAULT false,
                actualizado_por BIGINT REFERENCES usuarios(id),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        ");

        // 3) Licencia: límites por rol y estado (una sola fila de configuración)
        DB::statement("
            CREATE TABLE IF NOT EXISTS licencia (
                id BIGSERIAL PRIMARY KEY,
                max_usuarios INTEGER NOT NULL DEFAULT 100,
                max_administradores INTEGER NOT NULL DEFAULT 5,
                max_supervisores INTEGER NOT NULL DEFAULT 20,
                max_cobradores INTEGER NOT NULL DEFAULT 100,
                vence_el DATE,
                estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVA',
                actualizado_por BIGINT REFERENCES usuarios(id),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        ");

        // Fila única de licencia si no existe
        DB::statement("INSERT INTO licencia (id) VALUES (1) ON CONFLICT (id) DO NOTHING");
    }

    public function down(): void
    {
        DB::statement('DROP TABLE IF EXISTS feature_flags');
        DB::statement('DROP TABLE IF EXISTS licencia');
        // El valor de enum no se elimina (Postgres no soporta DROP VALUE de forma simple).
    }
};

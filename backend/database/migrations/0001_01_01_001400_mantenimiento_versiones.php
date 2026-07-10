<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Fase 2 del Admin Funcional:
 * - Tabla mantenimiento: estado del modo mantenimiento (una fila de config).
 * - Tabla versiones: historial de versiones liberadas.
 * Idempotente, sin afectar datos existentes.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement("
            CREATE TABLE IF NOT EXISTS mantenimiento (
                id BIGSERIAL PRIMARY KEY,
                activo BOOLEAN NOT NULL DEFAULT false,
                mensaje TEXT,
                inicio TIMESTAMPTZ,
                fin TIMESTAMPTZ,
                activado_por BIGINT REFERENCES usuarios(id),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        ");
        DB::statement("INSERT INTO mantenimiento (id) VALUES (1) ON CONFLICT (id) DO NOTHING");

        DB::statement("
            CREATE TABLE IF NOT EXISTS versiones (
                id BIGSERIAL PRIMARY KEY,
                version VARCHAR(40) NOT NULL,
                fecha_liberacion DATE NOT NULL DEFAULT CURRENT_DATE,
                mejoras TEXT,
                estado VARCHAR(20) NOT NULL DEFAULT 'PRODUCCION',
                registrado_por BIGINT REFERENCES usuarios(id),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        ");
    }

    public function down(): void
    {
        DB::statement('DROP TABLE IF EXISTS mantenimiento');
        DB::statement('DROP TABLE IF EXISTS versiones');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Historial de cambios de Área del Cliente (auditoría territorial permanente).
 * Cada vez que un cliente cambia de área, se registra el antes/después con
 * usuario, fecha y observación. Consultable para trazabilidad; nunca se borra.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement("
            CREATE TABLE IF NOT EXISTS historial_area_cliente (
                id BIGSERIAL PRIMARY KEY,
                cliente_id BIGINT NOT NULL REFERENCES clientes(id),
                area_anterior_id BIGINT REFERENCES areas(id),
                area_nueva_id BIGINT REFERENCES areas(id),
                cambiado_por BIGINT REFERENCES usuarios(id),
                observaciones TEXT,
                ip VARCHAR(60),
                user_agent TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        ");
        DB::statement('CREATE INDEX IF NOT EXISTS idx_hist_area_cliente ON historial_area_cliente(cliente_id, created_at)');
    }

    public function down(): void
    {
        DB::statement('DROP TABLE IF EXISTS historial_area_cliente');
    }
};

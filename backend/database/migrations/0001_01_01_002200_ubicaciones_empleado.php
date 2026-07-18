<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * UBICACIÓN DE EMPLEADOS EN TIEMPO REAL (mapa territorial).
 *
 * Cada cobrador/supervisor reporta su posición GPS cada ~60s mientras tiene la app
 * abierta. Se guarda el historial del día (para dibujar el recorrido) y el mapa
 * consulta la última posición + recorrido de HOY, filtrado por áreas.
 * Los puntos antiguos pueden depurarse periódicamente (no son auditoría contable).
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement("
            CREATE TABLE IF NOT EXISTS ubicaciones_empleado (
                id BIGSERIAL PRIMARY KEY,
                empleado_id BIGINT NOT NULL REFERENCES usuarios(id),
                latitud NUMERIC(10,7) NOT NULL,
                longitud NUMERIC(10,7) NOT NULL,
                precision_m NUMERIC(8,2),
                reportada_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        ");
        DB::statement('CREATE INDEX IF NOT EXISTS idx_ubicacion_empleado_dia ON ubicaciones_empleado(empleado_id, reportada_at)');
    }

    public function down(): void
    {
        DB::statement('DROP TABLE IF EXISTS ubicaciones_empleado');
    }
};

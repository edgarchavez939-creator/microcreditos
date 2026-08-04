<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * IDENTIDAD VISUAL ADMINISTRABLE.
 *
 * Los logos se guardan en su propia tabla y no en `parametros` porque son datos
 * pesados (base64) y esa tabla se consulta constantemente en la operación:
 * mezclarlos haría que cada lectura de un parámetro arrastre cientos de KB.
 *
 * Cada variante tiene un uso definido y se guarda una sola vez (clave única):
 *   ISOTIPO_COLOR   · isotipo a color, para fondos claros
 *   ISOTIPO_OSCURO  · isotipo preparado para fondo navy
 *   MONO_BLANCO     · monocromático blanco, sobre fondos oscuros
 *   MONO_NEGRO      · monocromático negro, sobre fondos claros (impresos, PDF)
 *   APP_ICON        · icono de aplicación, cuadrado redondeado
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement("
            CREATE TABLE IF NOT EXISTS marca_activos (
                id BIGSERIAL PRIMARY KEY,
                variante VARCHAR(20) NOT NULL UNIQUE,
                mime VARCHAR(60) NOT NULL,
                nombre_archivo VARCHAR(180),
                contenido_base64 TEXT NOT NULL,
                ancho INTEGER,
                alto INTEGER,
                actualizado_por BIGINT REFERENCES usuarios(id),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        ");
    }

    public function down(): void
    {
        DB::statement('DROP TABLE IF EXISTS marca_activos');
    }
};

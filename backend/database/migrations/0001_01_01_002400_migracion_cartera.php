<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * MÓDULO: MIGRACIÓN Y VALIDACIÓN DE CARTERA (Fase 1)
 *
 * - Nuevo estado del crédito: MIGRADO (fuera del workflow de aprobación).
 * - migracion_plantillas: mapeos de columnas reutilizables por origen (Empresa A, etc.).
 * - migraciones: cada LOTE importado/simulado, con su resumen y configuración.
 * - migracion_registros: cada FILA del archivo con su resultado (trazabilidad total).
 * - Columnas en solicitudes: vínculo al lote, estado de validación (Fase 2) y
 *   saldo migrado original (fotografía inmutable del valor importado).
 *
 * Aditiva e idempotente: no altera datos existentes.
 */
return new class extends Migration
{
    // ALTER TYPE ... ADD VALUE no puede correr dentro de una transacción en Postgres.
    public $withinTransaction = false;

    public function up(): void
    {
        DB::statement("ALTER TYPE estado_solicitud ADD VALUE IF NOT EXISTS 'MIGRADO'");

        DB::statement("
            CREATE TABLE IF NOT EXISTS migracion_plantillas (
                id BIGSERIAL PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL UNIQUE,
                mapeo JSONB NOT NULL,
                creado_por BIGINT REFERENCES usuarios(id),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        ");

        DB::statement("
            CREATE TABLE IF NOT EXISTS migraciones (
                id BIGSERIAL PRIMARY KEY,
                nombre_archivo VARCHAR(255) NOT NULL,
                plantilla_id BIGINT REFERENCES migracion_plantillas(id),
                estado VARCHAR(20) NOT NULL DEFAULT 'SIMULADA',  -- SIMULADA | IMPORTADA
                area_defecto_id BIGINT REFERENCES areas(id),
                cobrador_defecto_id BIGINT REFERENCES usuarios(id),
                producto_defecto_id BIGINT REFERENCES productos_financieros(id),
                total_registros INTEGER NOT NULL DEFAULT 0,
                validos INTEGER NOT NULL DEFAULT 0,
                con_advertencias INTEGER NOT NULL DEFAULT 0,
                con_errores INTEGER NOT NULL DEFAULT 0,
                clientes_a_crear INTEGER NOT NULL DEFAULT 0,
                clientes_a_actualizar INTEGER NOT NULL DEFAULT 0,
                creditos_a_crear INTEGER NOT NULL DEFAULT 0,
                creditos_omitidos INTEGER NOT NULL DEFAULT 0,
                importado_por BIGINT NOT NULL REFERENCES usuarios(id),
                importada_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        ");

        DB::statement("
            CREATE TABLE IF NOT EXISTS migracion_registros (
                id BIGSERIAL PRIMARY KEY,
                migracion_id BIGINT NOT NULL REFERENCES migraciones(id),
                fila INTEGER NOT NULL,
                datos JSONB NOT NULL,
                resultado VARCHAR(15) NOT NULL,          -- VALIDO | ADVERTENCIA | ERROR
                mensajes JSONB NOT NULL DEFAULT '[]',
                accion_cliente VARCHAR(15),              -- CREAR | ACTUALIZAR
                accion_credito VARCHAR(15),              -- CREAR | OMITIR
                cliente_id BIGINT REFERENCES clientes(id),
                solicitud_id BIGINT REFERENCES solicitudes(id),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        ");
        DB::statement('CREATE INDEX IF NOT EXISTS idx_migracion_registros_lote ON migracion_registros(migracion_id, resultado)');

        // Vínculo del crédito con su migración + estado de validación (Fase 2) + saldo original
        DB::statement("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS migracion_id BIGINT REFERENCES migraciones(id)");
        // Estados de validación (Fase 2): PENDIENTE | VALIDADO | CORREGIDO | BLOQUEADO (solo migrados)
        DB::statement("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS estado_validacion VARCHAR(20)");
        DB::statement("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS saldo_migrado NUMERIC(16,2)");
        DB::statement("CREATE INDEX IF NOT EXISTS idx_solicitudes_migracion ON solicitudes(migracion_id) WHERE migracion_id IS NOT NULL");
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE solicitudes DROP COLUMN IF EXISTS saldo_migrado');
        DB::statement('ALTER TABLE solicitudes DROP COLUMN IF EXISTS estado_validacion');
        DB::statement('ALTER TABLE solicitudes DROP COLUMN IF EXISTS migracion_id');
        DB::statement('DROP TABLE IF EXISTS migracion_registros');
        DB::statement('DROP TABLE IF EXISTS migraciones');
        DB::statement('DROP TABLE IF EXISTS migracion_plantillas');
        // El valor MIGRADO del enum no se elimina (PostgreSQL no lo permite de forma segura).
    }
};

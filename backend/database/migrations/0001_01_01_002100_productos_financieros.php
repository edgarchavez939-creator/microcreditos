<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * MOTOR DE PRODUCTOS FINANCIEROS.
 *
 * Los productos de crédito dejan de estar programados en el código y pasan a ser
 * configuración administrable. Cada producto define su comportamiento (tasa, seguro,
 * valor pactado, límites, aprobaciones, caja) y el sistema se adapta a esa config.
 *
 * VERSIONAMIENTO: cada modificación genera una versión con snapshot completo (JSONB).
 * Cada crédito guarda producto_id + producto_version del momento de su creación, y
 * además conserva sus condiciones en sus propias columnas (tasa, seguro, total), por
 * lo que NUNCA se recalcula con reglas nuevas.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement("
            CREATE TABLE IF NOT EXISTS productos_financieros (
                id BIGSERIAL PRIMARY KEY,
                codigo VARCHAR(30) NOT NULL UNIQUE,
                nombre VARCHAR(100) NOT NULL,
                descripcion TEXT,
                activo BOOLEAN NOT NULL DEFAULT true,
                color VARCHAR(20) DEFAULT '#4F46E5',
                icono VARCHAR(40),
                orden INT NOT NULL DEFAULT 0,
                version_actual INT NOT NULL DEFAULT 1,

                -- Condiciones financieras
                usa_tasa BOOLEAN NOT NULL DEFAULT true,
                tipo_tasa VARCHAR(20) NOT NULL DEFAULT 'MENSUAL',
                tasa_defecto NUMERIC(7,4) NOT NULL DEFAULT 0.10,
                permite_modificar_tasa BOOLEAN NOT NULL DEFAULT true,
                usa_seguro BOOLEAN NOT NULL DEFAULT true,
                seguro_defecto NUMERIC(5,4) NOT NULL DEFAULT 0.10,
                permite_modificar_seguro BOOLEAN NOT NULL DEFAULT true,
                usa_valor_pactado BOOLEAN NOT NULL DEFAULT false,
                permite_pagos_libres BOOLEAN NOT NULL DEFAULT true,
                permite_pagos_anticipados BOOLEAN NOT NULL DEFAULT true,
                permite_renovacion BOOLEAN NOT NULL DEFAULT true,
                permite_refinanciacion BOOLEAN NOT NULL DEFAULT true,
                permite_reestructuracion BOOLEAN NOT NULL DEFAULT true,
                requiere_codeudor BOOLEAN NOT NULL DEFAULT false,
                requiere_documentos BOOLEAN NOT NULL DEFAULT false,

                -- Límites
                capital_minimo NUMERIC(16,2) NOT NULL DEFAULT 0,
                capital_maximo NUMERIC(16,2) NOT NULL DEFAULT 999999999999,
                cuotas_minimo INT NOT NULL DEFAULT 1,
                cuotas_maximo INT NOT NULL DEFAULT 120,
                frecuencias_permitidas JSONB NOT NULL DEFAULT '[\"DIARIO\",\"SEMANAL\",\"QUINCENAL\",\"MENSUAL\"]',

                -- Aprobaciones
                requiere_supervisor BOOLEAN NOT NULL DEFAULT true,
                requiere_administrador BOOLEAN NOT NULL DEFAULT false,
                aprobacion_automatica BOOLEAN NOT NULL DEFAULT false,

                -- Caja
                permite_desembolso_efectivo BOOLEAN NOT NULL DEFAULT true,
                permite_desembolso_transferencia BOOLEAN NOT NULL DEFAULT true,
                recauda_seguro BOOLEAN NOT NULL DEFAULT true,
                maneja_caja BOOLEAN NOT NULL DEFAULT true,

                -- Extensión futura (comisiones, reglas especiales, etc.) sin migrar
                config_extra JSONB NOT NULL DEFAULT '{}',

                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        ");

        DB::statement("
            CREATE TABLE IF NOT EXISTS producto_versiones (
                id BIGSERIAL PRIMARY KEY,
                producto_id BIGINT NOT NULL REFERENCES productos_financieros(id),
                version INT NOT NULL,
                snapshot JSONB NOT NULL,
                cambios TEXT,
                cambiado_por BIGINT REFERENCES usuarios(id),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                UNIQUE (producto_id, version)
            )
        ");

        // Referencia del crédito al producto y versión usados en su creación
        DB::statement('ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS producto_financiero_id BIGINT REFERENCES productos_financieros(id)');
        DB::statement('ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS producto_version INT');
        DB::statement('ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS valor_pactado NUMERIC(16,2)');

        // Semilla: los dos productos iniciales
        DB::statement("
            INSERT INTO productos_financieros
                (codigo, nombre, descripcion, orden, usa_tasa, usa_seguro, usa_valor_pactado, color)
            VALUES
                ('TRADICIONAL', 'Crédito Tradicional',
                 'Crédito con tasa de interés mensual y seguro. El flujo clásico del negocio.',
                 1, true, true, false, '#4F46E5'),
                ('AL_BATE', 'Al Bate',
                 'El cliente pacta un valor total a pagar. La cuota es el valor pactado dividido en el número de cuotas. Sin tasa de interés ni seguro.',
                 2, false, false, true, '#0F766E')
            ON CONFLICT (codigo) DO NOTHING
        ");
        // Al Bate: sin seguro que recaudar
        DB::statement("UPDATE productos_financieros SET recauda_seguro = false, usa_seguro = false WHERE codigo = 'AL_BATE'");

        // Versión 1 de cada producto sembrado
        DB::statement("
            INSERT INTO producto_versiones (producto_id, version, snapshot, cambios)
            SELECT id, 1, to_jsonb(p.*), 'Creación inicial del producto'
            FROM productos_financieros p
            WHERE NOT EXISTS (SELECT 1 FROM producto_versiones v WHERE v.producto_id = p.id AND v.version = 1)
        ");

        // Backfill: los créditos existentes son del producto TRADICIONAL v1
        DB::statement("
            UPDATE solicitudes SET producto_financiero_id = (SELECT id FROM productos_financieros WHERE codigo = 'TRADICIONAL'),
                                   producto_version = 1
            WHERE producto_financiero_id IS NULL
        ");
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE solicitudes DROP COLUMN IF EXISTS valor_pactado');
        DB::statement('ALTER TABLE solicitudes DROP COLUMN IF EXISTS producto_version');
        DB::statement('ALTER TABLE solicitudes DROP COLUMN IF EXISTS producto_financiero_id');
        DB::statement('DROP TABLE IF EXISTS producto_versiones');
        DB::statement('DROP TABLE IF EXISTS productos_financieros');
    }
};

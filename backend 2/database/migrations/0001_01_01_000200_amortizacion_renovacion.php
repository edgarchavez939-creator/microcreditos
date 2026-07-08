<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Capa de amortización / reamortización / refinanciación.
 * Aditiva: no modifica la estructura ni los créditos existentes.
 */
return new class extends Migration
{
    // ALTER TYPE ... ADD VALUE no puede ir dentro de una transacción
    public $withinTransaction = false;

    public function up(): void
    {
        // --- Nuevos estados del crédito ---
        foreach (['PAGADO', 'EN_MORA', 'REAMORTIZADO', 'REFINANCIADO', 'CANCELADO'] as $estado) {
            DB::statement("ALTER TYPE estado_solicitud ADD VALUE IF NOT EXISTS '{$estado}'");
        }

        // --- Cupo del cliente ---
        DB::statement("ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cupo_inicial NUMERIC(16,2) NOT NULL DEFAULT 0");
        DB::statement("ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cupo_disponible NUMERIC(16,2) NOT NULL DEFAULT 0");

        // --- Trazabilidad y plazo en meses ---
        DB::statement("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS credito_origen_id BIGINT REFERENCES solicitudes(id)");
        DB::statement("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS plazo_meses INT");
        DB::statement("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS saldo_refinanciado NUMERIC(16,2) NOT NULL DEFAULT 0");
        DB::statement("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS total_pagado NUMERIC(16,2) NOT NULL DEFAULT 0");
        DB::statement("CREATE INDEX IF NOT EXISTS idx_solicitudes_origen ON solicitudes(credito_origen_id)");

        // --- Historial de renovaciones (relación padre-hijo) ---
        DB::statement(<<<SQL
            CREATE TABLE IF NOT EXISTS renovaciones (
                id                       BIGSERIAL PRIMARY KEY,
                credito_origen_id        BIGINT NOT NULL REFERENCES solicitudes(id),
                credito_nuevo_id         BIGINT NOT NULL REFERENCES solicitudes(id),
                cliente_id               BIGINT NOT NULL REFERENCES clientes(id),
                saldo_refinanciado       NUMERIC(16,2) NOT NULL,
                capital_aprobado         NUMERIC(16,2) NOT NULL,
                porcentaje_seguro        NUMERIC(5,4)  NOT NULL,
                valor_seguro             NUMERIC(16,2) NOT NULL,
                valor_desembolsado       NUMERIC(16,2) NOT NULL,
                dinero_adicional         NUMERIC(16,2) NOT NULL DEFAULT 0,
                recibido_cliente         NUMERIC(16,2) NOT NULL DEFAULT 0,
                interes_generado         NUMERIC(16,2) NOT NULL,
                total_deuda_nueva        NUMERIC(16,2) NOT NULL,
                cupo_disponible_despues  NUMERIC(16,2) NOT NULL,
                realizado_por            BIGINT REFERENCES usuarios(id),
                fecha_renovacion         TIMESTAMPTZ NOT NULL DEFAULT now(),
                created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        SQL);
        DB::statement("CREATE INDEX IF NOT EXISTS idx_renovaciones_cliente ON renovaciones(cliente_id)");

        // --- Parámetro configurable de reducción de cupo ---
        DB::statement(<<<SQL
            INSERT INTO parametros (clave, valor, descripcion)
            VALUES ('cupo.reduccion_por_renovacion', '100000', 'Reducción fija de cupo por cada renovación')
            ON CONFLICT (clave) DO NOTHING
        SQL);
    }

    public function down(): void
    {
        DB::statement("DROP TABLE IF EXISTS renovaciones CASCADE");
        foreach (['credito_origen_id', 'plazo_meses', 'saldo_refinanciado', 'total_pagado'] as $col) {
            DB::statement("ALTER TABLE solicitudes DROP COLUMN IF EXISTS {$col}");
        }
        DB::statement("ALTER TABLE clientes DROP COLUMN IF EXISTS cupo_inicial");
        DB::statement("ALTER TABLE clientes DROP COLUMN IF EXISTS cupo_disponible");
        // Nota: PostgreSQL no permite eliminar valores de un ENUM; se conservan.
    }
};

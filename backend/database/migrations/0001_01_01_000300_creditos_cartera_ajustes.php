<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Ajustes a Créditos / Cartera / Pagos (aditivo, no rompe datos existentes):
 *  - Desglose capital/interés por cuota.
 *  - Observaciones en el pago.
 *  - Número de crédito legible y único (CR-000123).
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE cuotas ADD COLUMN IF NOT EXISTS abono_capital NUMERIC(16,2) NOT NULL DEFAULT 0");
        DB::statement("ALTER TABLE cuotas ADD COLUMN IF NOT EXISTS abono_interes NUMERIC(16,2) NOT NULL DEFAULT 0");

        DB::statement("ALTER TABLE pagos ADD COLUMN IF NOT EXISTS observaciones TEXT");

        DB::statement("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS numero_credito VARCHAR(20)");
        DB::statement("CREATE UNIQUE INDEX IF NOT EXISTS idx_solicitudes_numero_credito ON solicitudes(numero_credito) WHERE numero_credito IS NOT NULL");

        // Backfill: asigna número a los créditos ya aprobados que aún no lo tienen.
        DB::statement(<<<SQL
            UPDATE solicitudes
               SET numero_credito = 'CR-' || LPAD(id::text, 6, '0')
             WHERE numero_credito IS NULL
               AND estado IN ('APROBADO','DESEMBOLSADO','ACTIVO','EN_MORA','PAGADO','REAMORTIZADO','REFINANCIADO','CANCELADO')
        SQL);
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE cuotas DROP COLUMN IF EXISTS abono_capital");
        DB::statement("ALTER TABLE cuotas DROP COLUMN IF EXISTS abono_interes");
        DB::statement("ALTER TABLE pagos DROP COLUMN IF EXISTS observaciones");
        DB::statement("DROP INDEX IF EXISTS idx_solicitudes_numero_credito");
        DB::statement("ALTER TABLE solicitudes DROP COLUMN IF EXISTS numero_credito");
    }
};

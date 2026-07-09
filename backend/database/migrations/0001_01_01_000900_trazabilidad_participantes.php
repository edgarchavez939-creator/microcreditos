<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Amplía la trazabilidad de participantes en el ciclo económico, separando
 * claramente cada responsabilidad (auditoría) del propietario del movimiento
 * económico (cálculo de caja/indicadores).
 *
 * Regla: los cálculos financieros usan SOLO el usuario que origina el valor
 * (collected_by en pagos, created_by en la solicitud para seguros). Los demás
 * campos son para auditoría y no afectan caja.
 */
return new class extends Migration
{
    public function up(): void
    {
        // --- pagos: participantes del recaudo ---
        // collected_by = quien realmente recauda (propietario del movimiento de caja).
        // approved_by  = quien aprueba la transferencia (solo auditoría, no afecta caja).
        // modified_by / cancelled_by = trazabilidad de cambios y anulaciones.
        DB::statement('ALTER TABLE pagos ADD COLUMN IF NOT EXISTS collected_by BIGINT REFERENCES usuarios(id)');
        DB::statement('ALTER TABLE pagos ADD COLUMN IF NOT EXISTS approved_by BIGINT REFERENCES usuarios(id)');
        DB::statement('ALTER TABLE pagos ADD COLUMN IF NOT EXISTS modified_by BIGINT REFERENCES usuarios(id)');
        DB::statement('ALTER TABLE pagos ADD COLUMN IF NOT EXISTS cancelled_by BIGINT REFERENCES usuarios(id)');
        DB::statement('ALTER TABLE pagos ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ');

        // Backfill: para los pagos existentes, el recaudador es quien lo registró.
        DB::statement('UPDATE pagos SET collected_by = registrado_por WHERE collected_by IS NULL');

        // --- desembolsos: dejar explícito quién desembolsó (ya existe registrado_por) ---
        // Se mantiene registrado_por como "disbursed_by" (política actual: quien entrega).

        // --- Corrección de datos históricos en movimientos_caja ---
        // 1) Pagos por transferencia ya aprobados: el movimiento debe pertenecer a
        //    quien registró el pago (collected_by), no a quien lo aprobó.
        DB::statement("
            UPDATE movimientos_caja mc
            SET registrado_por = p.collected_by
            FROM pagos p
            WHERE mc.referencia_tipo = 'PAGO'
              AND mc.referencia_id = p.id
              AND p.collected_by IS NOT NULL
              AND mc.registrado_por <> p.collected_by
        ");
    }

    public function down(): void
    {
        foreach (['collected_by', 'approved_by', 'modified_by', 'cancelled_by', 'cancelled_at'] as $col) {
            DB::statement("ALTER TABLE pagos DROP COLUMN IF EXISTS {$col}");
        }
    }
};

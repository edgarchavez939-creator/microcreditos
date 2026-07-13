<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Trazabilidad de renovaciones (relación padre-hijo entre créditos):
 * - credito_origen_id: el crédito PAGADO que dio origen a esta solicitud.
 * - tipo_origen: RENOVACION (extensible a REFINANCIACION/REESTRUCTURACION futuras).
 * - renovado_por: usuario que ejecutó la renovación.
 * La fecha de renovación es el created_at de la nueva solicitud.
 * Permite navegar la cadena 001 → 002 → 003 sin límite de profundidad.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS credito_origen_id BIGINT REFERENCES solicitudes(id)');
        DB::statement("ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS tipo_origen VARCHAR(20)");
        DB::statement('ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS renovado_por BIGINT REFERENCES usuarios(id)');
        DB::statement('CREATE INDEX IF NOT EXISTS idx_solicitudes_origen ON solicitudes(credito_origen_id)');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS idx_solicitudes_origen');
        foreach (['credito_origen_id', 'tipo_origen', 'renovado_por'] as $col) {
            DB::statement("ALTER TABLE solicitudes DROP COLUMN IF EXISTS {$col}");
        }
    }
};

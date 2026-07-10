<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Reaplica la corrección de medio_pago histórico con el cast ::text correcto.
 * (La migración 001100 falló antes por comparar varchar con enum sin castear;
 * como quedó marcada como ejecutada, esta nueva migración garantiza la corrección.)
 * Idempotente y seguro.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Pagos
        DB::statement("
            UPDATE movimientos_caja mc
            SET medio_pago = p.metodo::text
            FROM pagos p
            WHERE mc.referencia_tipo = 'PAGO'
              AND mc.referencia_id = p.id
              AND mc.medio_pago <> p.metodo::text
        ");

        // Desembolsos
        DB::statement("
            UPDATE movimientos_caja mc
            SET medio_pago = d.metodo::text
            FROM desembolsos d
            WHERE mc.referencia_tipo = 'DESEMBOLSO'
              AND mc.referencia_id = d.solicitud_id
              AND mc.medio_pago <> d.metodo::text
        ");
    }

    public function down(): void
    {
        // No revertible: corrección de datos.
    }
};

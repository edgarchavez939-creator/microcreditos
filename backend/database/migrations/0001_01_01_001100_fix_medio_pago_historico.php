<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Corrige el medio_pago de movimientos de caja históricos que quedaron como
 * 'EFECTIVO' por defecto cuando en realidad correspondían a otro medio.
 * Toma el medio real desde la transacción original (pagos / desembolsos).
 * Idempotente: solo ajusta lo que esté mal clasificado.
 */
return new class extends Migration
{
    public function up(): void
    {
        // 1) Pagos: el movimiento de caja debe reflejar el metodo real del pago.
        DB::statement("
            UPDATE movimientos_caja mc
            SET medio_pago = p.metodo
            FROM pagos p
            WHERE mc.referencia_tipo = 'PAGO'
              AND mc.referencia_id = p.id
              AND mc.medio_pago <> p.metodo
        ");

        // 2) Desembolsos: el movimiento debe reflejar el metodo real del desembolso.
        //    Se cruza por solicitud y se toma el desembolso más reciente de esa solicitud.
        DB::statement("
            UPDATE movimientos_caja mc
            SET medio_pago = d.metodo
            FROM desembolsos d
            WHERE mc.referencia_tipo = 'DESEMBOLSO'
              AND mc.referencia_id = d.solicitud_id
              AND mc.medio_pago <> d.metodo
        ");
    }

    public function down(): void
    {
        // No revertible: es una corrección de datos.
    }
};

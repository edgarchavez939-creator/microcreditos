<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Amplía el módulo de caja a un flujo de tesorería completo:
 * - movimientos_caja: medio de pago (efectivo/transferencia), subtipo de gasto, hora.
 * - cierres_caja: base inicial, desglose por concepto, arqueo y diferencia.
 * Todo idempotente y sin tocar datos existentes.
 */
return new class extends Migration
{
    public function up(): void
    {
        // --- movimientos_caja: nuevas columnas ---
        DB::statement("ALTER TABLE movimientos_caja ADD COLUMN IF NOT EXISTS medio_pago VARCHAR(20) NOT NULL DEFAULT 'EFECTIVO'");
        DB::statement("ALTER TABLE movimientos_caja ADD COLUMN IF NOT EXISTS subtipo VARCHAR(40)");
        DB::statement("ALTER TABLE movimientos_caja ADD COLUMN IF NOT EXISTS observacion TEXT");

        // --- cierres_caja: desglose de tesorería y arqueo ---
        foreach ([
            'base_inicial'         => 'NUMERIC(16,2) NOT NULL DEFAULT 0',
            'cobros_efectivo'      => 'NUMERIC(16,2) NOT NULL DEFAULT 0',
            'cobros_transferencia' => 'NUMERIC(16,2) NOT NULL DEFAULT 0',
            'recaudo_seguros'      => 'NUMERIC(16,2) NOT NULL DEFAULT 0',
            'total_desembolsos'    => 'NUMERIC(16,2) NOT NULL DEFAULT 0',
            'total_gastos'         => 'NUMERIC(16,2) NOT NULL DEFAULT 0',
            'efectivo_esperado'    => 'NUMERIC(16,2) NOT NULL DEFAULT 0',
            'efectivo_contado'     => 'NUMERIC(16,2)',
            'diferencia'           => 'NUMERIC(16,2) NOT NULL DEFAULT 0',
            'hora_apertura'        => 'TIMESTAMPTZ',
            'hora_cierre'          => 'TIMESTAMPTZ',
            'observacion'          => 'TEXT',
        ] as $col => $tipo) {
            DB::statement("ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS {$col} {$tipo}");
        }

        // Índice para consultar movimientos del día por usuario rápidamente
        DB::statement("CREATE INDEX IF NOT EXISTS idx_caja_fecha_usuario ON movimientos_caja(fecha, registrado_por)");
    }

    public function down(): void
    {
        foreach (['medio_pago', 'subtipo', 'observacion'] as $col) {
            DB::statement("ALTER TABLE movimientos_caja DROP COLUMN IF EXISTS {$col}");
        }
        foreach ([
            'base_inicial','cobros_efectivo','cobros_transferencia','recaudo_seguros',
            'total_desembolsos','total_gastos','efectivo_esperado','efectivo_contado',
            'diferencia','hora_apertura','hora_cierre','observacion',
        ] as $col) {
            DB::statement("ALTER TABLE cierres_caja DROP COLUMN IF EXISTS {$col}");
        }
    }
};

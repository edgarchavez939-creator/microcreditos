<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * MEJORA INTEGRAL DEL MÓDULO DE CAJA
 *
 * 1) REPOSICIONES DE EFECTIVO: nuevo tipo de movimiento durante la jornada.
 *    Se registra en movimientos_caja con referencia_tipo = 'REPOSICION' y guarda
 *    quién entrega el dinero (entregado_por).
 *
 * 2) DESGLOSE EN EL CIERRE: el cierre individual guarda reposiciones y separa los
 *    desembolsos y gastos por medio de pago, para que el arqueo y la Caja General
 *    muestren exactamente las mismas cifras que el resumen del día.
 *
 * 3) ANULACIÓN DE DESEMBOLSOS: el desembolso pasa a ser reversible (nunca se borra;
 *    se marca anulado y se registra el movimiento de caja inverso).
 *
 * Todo idempotente: no altera datos existentes.
 */
return new class extends Migration
{
    public function up(): void
    {
        // --- movimientos_caja: quién entrega el efectivo en una reposición ---
        DB::statement("ALTER TABLE movimientos_caja ADD COLUMN IF NOT EXISTS entregado_por BIGINT REFERENCES usuarios(id)");

        // --- cierres_caja: desglose completo del arqueo ---
        foreach ([
            'reposiciones'              => 'NUMERIC(16,2) NOT NULL DEFAULT 0',
            'desembolsos_efectivo'      => 'NUMERIC(16,2) NOT NULL DEFAULT 0',
            'desembolsos_transferencia' => 'NUMERIC(16,2) NOT NULL DEFAULT 0',
            'gastos_efectivo'           => 'NUMERIC(16,2) NOT NULL DEFAULT 0',
            'numero_reposiciones'       => 'INTEGER NOT NULL DEFAULT 0',
        ] as $col => $tipo) {
            DB::statement("ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS {$col} {$tipo}");
        }

        // --- cierres_generales: consolidado de reposiciones y de diferencias de arqueo ---
        foreach ([
            'total_reposiciones'       => 'NUMERIC(16,2) NOT NULL DEFAULT 0',
            'total_diferencias_arqueo' => 'NUMERIC(16,2) NOT NULL DEFAULT 0',
        ] as $col => $tipo) {
            DB::statement("ALTER TABLE cierres_generales ADD COLUMN IF NOT EXISTS {$col} {$tipo}");
        }

        // --- desembolsos: reversibles (nunca se eliminan del histórico) ---
        foreach ([
            'anulado_at'        => 'TIMESTAMPTZ',
            'anulado_por'       => 'BIGINT REFERENCES usuarios(id)',
            'motivo_anulacion'  => 'TEXT',
        ] as $col => $tipo) {
            DB::statement("ALTER TABLE desembolsos ADD COLUMN IF NOT EXISTS {$col} {$tipo}");
        }

        // Índice para las consultas de caja por tipo de movimiento
        DB::statement("CREATE INDEX IF NOT EXISTS idx_caja_referencia ON movimientos_caja(referencia_tipo, fecha)");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE movimientos_caja DROP COLUMN IF EXISTS entregado_por");
        foreach (['reposiciones', 'desembolsos_efectivo', 'desembolsos_transferencia', 'gastos_efectivo', 'numero_reposiciones'] as $col) {
            DB::statement("ALTER TABLE cierres_caja DROP COLUMN IF EXISTS {$col}");
        }
        foreach (['total_reposiciones', 'total_diferencias_arqueo'] as $col) {
            DB::statement("ALTER TABLE cierres_generales DROP COLUMN IF EXISTS {$col}");
        }
        foreach (['anulado_at', 'anulado_por', 'motivo_anulacion'] as $col) {
            DB::statement("ALTER TABLE desembolsos DROP COLUMN IF EXISTS {$col}");
        }
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Caja General (tesorería de dos niveles):
 * - Añade el flujo de estados a cierres_caja (CERRADA→PENDIENTE_ENTREGA→RECIBIDA→CONSOLIDADA)
 *   y los campos de recepción (quién recibió, cuándo, efectivo entregado, observación).
 * - Crea cierres_generales: el cierre oficial consolidado del negocio (inmutable).
 * Idempotente. No afecta datos existentes: los cierres previos quedan como RECIBIDA
 * (ya fueron cerrados en el modelo anterior, no requieren entrega pendiente).
 */
return new class extends Migration
{
    public function up(): void
    {
        // Flujo de estados y recepción en cada cierre individual
        foreach ([
            'estado'            => "VARCHAR(20) NOT NULL DEFAULT 'CERRADA'",
            'recibido_por'      => 'BIGINT REFERENCES usuarios(id)',
            'recibido_at'       => 'TIMESTAMPTZ',
            'efectivo_entregado'=> 'NUMERIC(16,2)',
            'diferencia_entrega'=> 'NUMERIC(16,2)',
            'observacion_entrega' => 'TEXT',
            'cierre_general_id' => 'BIGINT',
        ] as $col => $tipo) {
            DB::statement("ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS {$col} {$tipo}");
        }

        // Los cierres históricos se consideran ya recibidos (modelo anterior sin entrega)
        DB::statement("UPDATE cierres_caja SET estado = 'RECIBIDA' WHERE estado = 'CERRADA' AND created_at < now() - interval '1 hour'");

        // Cierre General: consolidación oficial del día (una fotografía inmutable)
        DB::statement("
            CREATE TABLE IF NOT EXISTS cierres_generales (
                id BIGSERIAL PRIMARY KEY,
                fecha DATE NOT NULL,
                cerrado_por BIGINT REFERENCES usuarios(id),
                numero_cajas INTEGER NOT NULL DEFAULT 0,
                usuarios_incluidos TEXT,
                total_base_inicial NUMERIC(16,2) NOT NULL DEFAULT 0,
                total_cobros_efectivo NUMERIC(16,2) NOT NULL DEFAULT 0,
                total_cobros_transferencia NUMERIC(16,2) NOT NULL DEFAULT 0,
                total_recaudo_seguros NUMERIC(16,2) NOT NULL DEFAULT 0,
                total_desembolsos_efectivo NUMERIC(16,2) NOT NULL DEFAULT 0,
                total_desembolsos_transferencia NUMERIC(16,2) NOT NULL DEFAULT 0,
                total_gastos NUMERIC(16,2) NOT NULL DEFAULT 0,
                movimiento_total NUMERIC(16,2) NOT NULL DEFAULT 0,
                total_efectivo_esperado NUMERIC(16,2) NOT NULL DEFAULT 0,
                total_efectivo_recibido NUMERIC(16,2) NOT NULL DEFAULT 0,
                diferencia_general NUMERIC(16,2) NOT NULL DEFAULT 0,
                observaciones TEXT,
                estado VARCHAR(20) NOT NULL DEFAULT 'CERRADO',
                ip VARCHAR(60),
                user_agent TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                UNIQUE (fecha)
            )
        ");
    }

    public function down(): void
    {
        foreach (['estado','recibido_por','recibido_at','efectivo_entregado','diferencia_entrega','observacion_entrega','cierre_general_id'] as $col) {
            DB::statement("ALTER TABLE cierres_caja DROP COLUMN IF EXISTS {$col}");
        }
        DB::statement('DROP TABLE IF EXISTS cierres_generales');
    }
};

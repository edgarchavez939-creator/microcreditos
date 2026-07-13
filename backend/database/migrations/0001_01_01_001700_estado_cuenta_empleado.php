<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * ESTADO DE CUENTA DEL EMPLEADO — mayor auxiliar por colaborador.
 *
 * Diseño extensible (un solo ledger para todos los conceptos):
 *  - obligaciones_empleado: cabecera de cada deuda (descuadre, préstamo, y futuros
 *    conceptos configurables). Tipo por VARCHAR (no enum) para no requerir migración
 *    al añadir conceptos nuevos.
 *  - movimientos_empleado: extracto cronológico inmutable (débitos/créditos con saldo).
 *
 * También marca los cierres de caja ya trasladados a una obligación, para no
 * acumular dos veces el mismo descuadre en el cierre semanal.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement("
            CREATE TABLE IF NOT EXISTS obligaciones_empleado (
                id BIGSERIAL PRIMARY KEY,
                empleado_id BIGINT NOT NULL REFERENCES usuarios(id),
                tipo VARCHAR(40) NOT NULL,          -- DESCUADRE_CAJA | PRESTAMO_INTERNO | (futuros)
                concepto VARCHAR(160) NOT NULL,
                observaciones TEXT,
                monto_original NUMERIC(16,2) NOT NULL DEFAULT 0,
                saldo NUMERIC(16,2) NOT NULL DEFAULT 0,
                estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',   -- PENDIENTE | PAGADO
                periodo_desde DATE,                 -- para descuadres semanales
                periodo_hasta DATE,
                creado_por BIGINT REFERENCES usuarios(id),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        ");
        DB::statement('CREATE INDEX IF NOT EXISTS idx_oblig_empleado ON obligaciones_empleado(empleado_id, estado)');

        DB::statement("
            CREATE TABLE IF NOT EXISTS movimientos_empleado (
                id BIGSERIAL PRIMARY KEY,
                empleado_id BIGINT NOT NULL REFERENCES usuarios(id),
                obligacion_id BIGINT REFERENCES obligaciones_empleado(id),
                tipo VARCHAR(20) NOT NULL,          -- CARGO (débito) | ABONO (crédito)
                concepto VARCHAR(160) NOT NULL,
                debito NUMERIC(16,2) NOT NULL DEFAULT 0,
                credito NUMERIC(16,2) NOT NULL DEFAULT 0,
                saldo_obligacion NUMERIC(16,2) NOT NULL DEFAULT 0,  -- saldo de la obligación tras el movimiento
                observaciones TEXT,
                registrado_por BIGINT REFERENCES usuarios(id),
                ip VARCHAR(60),
                user_agent TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        ");
        DB::statement('CREATE INDEX IF NOT EXISTS idx_mov_empleado ON movimientos_empleado(empleado_id, created_at)');

        // Marca en el cierre de caja: ¿ya se trasladó su descuadre a una obligación?
        DB::statement('ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS descuadre_liquidado BOOLEAN NOT NULL DEFAULT false');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE cierres_caja DROP COLUMN IF EXISTS descuadre_liquidado');
        DB::statement('DROP TABLE IF EXISTS movimientos_empleado');
        DB::statement('DROP TABLE IF EXISTS obligaciones_empleado');
    }
};

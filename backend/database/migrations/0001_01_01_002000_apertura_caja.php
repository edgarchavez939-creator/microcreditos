<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * APERTURA FORMAL DE CAJA (control de tesorería).
 *
 * Hasta ahora la caja "se abría sola" al registrar el primer movimiento del día.
 * Esta migración introduce un acto explícito de apertura: una fila por empleado y
 * día en aperturas_caja, con su estado. Sin una apertura ABIERTA, el sistema
 * bloquea cobros, desembolsos y gastos.
 *
 * Estados: ABIERTA -> CERRADA (el flujo posterior de entrega/consolidación vive en
 * cierres_caja, que ya existe). Una apertura por empleado y día (índice único).
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement("
            CREATE TABLE IF NOT EXISTS aperturas_caja (
                id BIGSERIAL PRIMARY KEY,
                empleado_id BIGINT NOT NULL REFERENCES usuarios(id),
                fecha DATE NOT NULL,
                estado VARCHAR(20) NOT NULL DEFAULT 'ABIERTA',   -- ABIERTA | CERRADA
                base_inicial NUMERIC(16,2) NOT NULL DEFAULT 0,
                observacion_apertura TEXT,
                abierta_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                cerrada_at TIMESTAMPTZ,
                cierre_caja_id BIGINT REFERENCES cierres_caja(id),
                ip VARCHAR(60),
                user_agent TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        ");
        // Una apertura por empleado y día
        DB::statement('CREATE UNIQUE INDEX IF NOT EXISTS uq_apertura_empleado_fecha ON aperturas_caja(empleado_id, fecha)');

        // Compatibilidad hacia atrás: para los días YA operados (que tienen movimientos
        // pero no apertura formal), se crea una apertura ABIERTA retroactiva con la base
        // registrada, para no romper cierres en curso ni el historial.
        DB::statement("
            INSERT INTO aperturas_caja (empleado_id, fecha, estado, base_inicial, abierta_at, created_at)
            SELECT m.registrado_por, m.fecha::date, 'ABIERTA',
                   COALESCE((SELECT SUM(valor) FROM movimientos_caja b
                             WHERE b.registrado_por = m.registrado_por AND b.fecha::date = m.fecha::date
                               AND b.referencia_tipo = 'BASE_INICIAL'), 0),
                   MIN(m.created_at), now()
            FROM movimientos_caja m
            WHERE m.registrado_por IS NOT NULL
            GROUP BY m.registrado_por, m.fecha::date
            ON CONFLICT (empleado_id, fecha) DO NOTHING
        ");

        // Marcar como CERRADA la apertura de los días que ya tienen cierre registrado.
        DB::statement("
            UPDATE aperturas_caja a SET estado = 'CERRADA', cerrada_at = c.hora_cierre, cierre_caja_id = c.id
            FROM cierres_caja c
            WHERE c.cerrado_por = a.empleado_id AND c.fecha::date = a.fecha
        ");
    }

    public function down(): void
    {
        DB::statement('DROP TABLE IF EXISTS aperturas_caja');
    }
};

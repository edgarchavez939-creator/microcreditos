<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Completa la "fotografía inmutable" del cierre de caja: rol del usuario,
 * quién abrió la caja, contadores del día e IP/dispositivo. Todo idempotente.
 * El historial leerá SOLO estos campos persistidos, nunca recalculará.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach ([
            'rol_usuario'      => 'VARCHAR(30)',
            'abierto_por'      => 'BIGINT REFERENCES usuarios(id)',
            'movimiento_total' => 'NUMERIC(16,2) NOT NULL DEFAULT 0',
            'numero_pagos'     => 'INTEGER NOT NULL DEFAULT 0',
            'numero_desembolsos' => 'INTEGER NOT NULL DEFAULT 0',
            'numero_gastos'    => 'INTEGER NOT NULL DEFAULT 0',
            'numero_seguros'   => 'INTEGER NOT NULL DEFAULT 0',
            'ip'               => 'VARCHAR(60)',
            'user_agent'       => 'TEXT',
        ] as $col => $tipo) {
            DB::statement("ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS {$col} {$tipo}");
        }

        // Backfill del rol para cierres históricos (a partir del usuario que cerró)
        DB::statement("
            UPDATE cierres_caja cc
            SET rol_usuario = u.rol, abierto_por = COALESCE(cc.abierto_por, cc.cerrado_por)
            FROM usuarios u
            WHERE u.id = cc.cerrado_por AND cc.rol_usuario IS NULL
        ");
    }

    public function down(): void
    {
        foreach ([
            'rol_usuario','abierto_por','movimiento_total','numero_pagos',
            'numero_desembolsos','numero_gastos','numero_seguros','ip','user_agent',
        ] as $col) {
            DB::statement("ALTER TABLE cierres_caja DROP COLUMN IF EXISTS {$col}");
        }
    }
};

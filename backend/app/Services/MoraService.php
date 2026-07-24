<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

class MoraService
{
    /**
     * Sincroniza estados de mora (idempotente y barato):
     * - Cuotas vencidas (PENDIENTE/PARCIAL con fecha pasada) → VENCIDA + días de mora.
     * - Créditos ACTIVOS con cuotas vencidas → EN_MORA.
     * - Créditos EN_MORA sin cuotas vencidas (se pusieron al día) → ACTIVO.
     */
    public function sincronizar(): void
    {
        // 1) Cuotas: marcar vencidas y actualizar días de mora
        DB::statement("
            UPDATE cuotas
               SET estado = 'VENCIDA',
                   dias_mora = GREATEST((CURRENT_DATE - fecha_vencimiento), 0)
             WHERE fecha_vencimiento < CURRENT_DATE
               AND estado IN ('PENDIENTE', 'PARCIAL')
        ");

        // Mantener al día el contador de las ya vencidas
        DB::statement("
            UPDATE cuotas
               SET dias_mora = GREATEST((CURRENT_DATE - fecha_vencimiento), 0)
             WHERE estado = 'VENCIDA'
        ");

        // 2) Créditos activos con vencidas → EN_MORA
        DB::statement("
            UPDATE solicitudes s
               SET estado = 'EN_MORA'
             WHERE s.estado IN ('ACTIVO', 'MIGRADO')
               AND EXISTS (
                    SELECT 1 FROM cuotas q
                     WHERE q.solicitud_id = s.id AND q.estado = 'VENCIDA'
               )
        ");

        // 3) Créditos en mora que se pusieron al día → ACTIVO
        DB::statement("
            UPDATE solicitudes s
               SET estado = 'ACTIVO'
             WHERE s.estado = 'EN_MORA'
               AND NOT EXISTS (
                    SELECT 1 FROM cuotas q
                     WHERE q.solicitud_id = s.id AND q.estado = 'VENCIDA'
               )
        ");
    }
}

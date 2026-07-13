<?php

namespace App\Services;

use App\Models\Usuario;
use Illuminate\Support\Facades\DB;

/**
 * Motor de tareas pendientes (núcleo de notificaciones).
 *
 * Único punto del sistema que responde "¿qué tiene pendiente este usuario?".
 * Cuenta TAREAS REALES desde el estado de los procesos (workflow-driven):
 * el badge aparece cuando existe trabajo y desaparece automáticamente cuando
 * la tarea se atiende (el estado cambia), sin depender de marcar "leído".
 *
 * Extensible: para sumar un módulo al sistema de badges basta añadir su
 * contador aquí. Es la semilla del futuro Inbox de Trabajo.
 */
class TareaService
{
    /** Conteo de tareas pendientes por módulo, según el rol del usuario. */
    public function badges(Usuario $u): array
    {
        $badges = [];

        // --- Aprobaciones: solicitudes esperando decisión ---
        if ($u->esAdministrador()) {
            $badges['aprobaciones'] = (int) DB::table('solicitudes')
                ->whereIn('estado', ['PENDIENTE_SUPERVISOR', 'PENDIENTE_ADMINISTRADOR'])
                ->count();
        } elseif ($u->esSupervisor()) {
            $areas = DB::table('usuario_area')->where('usuario_id', $u->id)->pluck('area_id');
            $badges['aprobaciones'] = (int) DB::table('solicitudes')
                ->where('estado', 'PENDIENTE_SUPERVISOR')
                ->whereIn('area_id', $areas)
                ->count();
        }

        // --- Transferencias: pagos por transferencia esperando validación ---
        if ($u->esAdministrador() || $u->esSupervisor()) {
            $badges['transferencias'] = (int) DB::table('transferencias')
                ->where('estado', 'PENDIENTE_VALIDACION')
                ->count();
        }

        // --- Caja General: cajas entregadas esperando recepción (solo admin) ---
        if ($u->esAdministrador()) {
            $badges['caja-general'] = (int) DB::table('cierres_caja')
                ->whereDate('fecha', now()->toDateString())
                ->where('estado', 'PENDIENTE_ENTREGA')
                ->count();
        }

        // Solo módulos con tareas (badge 0 no se envía: menos ruido)
        return array_filter($badges, fn ($n) => $n > 0);
    }
}

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
                ->whereIn('cliente_id',
                    DB::table('clientes')->whereIn('area_id', $areas)->select('id'))
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

            // --- Estado de cuenta: empleados con obligaciones pendientes ---
            $badges['estado-cuenta'] = (int) DB::table('obligaciones_empleado')
                ->where('estado', 'PENDIENTE')
                ->distinct('empleado_id')
                ->count('empleado_id');
        }

        // Solo módulos con tareas (badge 0 no se envía: menos ruido)
        return array_filter($badges, fn ($n) => $n > 0);
    }

    /**
     * INBOX DE TRABAJO: los detalles de cada tarea pendiente (no solo el conteo).
     * Usa exactamente los mismos criterios que badges() para mantener coherencia:
     * una tarea aparece aquí si y solo si suma a un badge. Devuelve grupos con sus
     * ítems, cada uno con lo necesario para entenderlo y navegar a resolverlo.
     */
    public function inbox(Usuario $u): array
    {
        $grupos = [];

        // --- Aprobaciones ---
        $aprobQuery = DB::table('solicitudes as s')
            ->join('clientes as c', 'c.id', '=', 's.cliente_id')
            ->orderBy('s.created_at');

        if ($u->esAdministrador()) {
            $aprobQuery->whereIn('s.estado', ['PENDIENTE_SUPERVISOR', 'PENDIENTE_ADMINISTRADOR']);
        } elseif ($u->esSupervisor()) {
            $areas = DB::table('usuario_area')->where('usuario_id', $u->id)->pluck('area_id');
            $aprobQuery->where('s.estado', 'PENDIENTE_SUPERVISOR')
                ->whereIn('s.cliente_id', DB::table('clientes')->whereIn('area_id', $areas)->select('id'));
        } else {
            $aprobQuery = null;
        }

        if ($aprobQuery) {
            $items = $aprobQuery->limit(20)->get([
                's.id', 's.numero_credito', 's.capital_solicitado', 's.estado', 's.created_at',
                'c.nombres', 'c.apellidos',
            ])->map(fn ($s) => [
                'id' => $s->id,
                'titulo' => trim("{$s->nombres} {$s->apellidos}"),
                'detalle' => 'Solicita ' . number_format((float) $s->capital_solicitado / 1000, 0, ',', '.') . ' mil'
                    . ($s->estado === 'PENDIENTE_ADMINISTRADOR' ? ' · requiere administrador' : ''),
                'fecha' => $s->created_at,
                'modulo' => 'aprobaciones',
            ]);
            if ($items->isNotEmpty()) {
                $grupos[] = ['clave' => 'aprobaciones', 'titulo' => 'Solicitudes por aprobar', 'tono' => 'atencion', 'items' => $items];
            }
        }

        // --- Transferencias por validar ---
        if ($u->esAdministrador() || $u->esSupervisor()) {
            $items = DB::table('transferencias as t')
                ->join('clientes as c', 'c.id', '=', 't.cliente_id')
                ->where('t.estado', 'PENDIENTE_VALIDACION')
                ->orderBy('t.created_at')
                ->limit(20)
                ->get(['t.id', 't.valor', 't.created_at', 'c.nombres', 'c.apellidos'])
                ->map(fn ($t) => [
                    'id' => $t->id,
                    'titulo' => trim("{$t->nombres} {$t->apellidos}"),
                    'detalle' => 'Transferencia de ' . number_format((float) $t->valor / 1000, 0, ',', '.') . ' mil por validar',
                    'fecha' => $t->created_at,
                    'modulo' => 'transferencias',
                ]);
            if ($items->isNotEmpty()) {
                $grupos[] = ['clave' => 'transferencias', 'titulo' => 'Transferencias por validar', 'tono' => 'info', 'items' => $items];
            }
        }

        // --- Cajas por recibir (admin) ---
        if ($u->esAdministrador()) {
            $items = DB::table('cierres_caja as cc')
                ->leftJoin('usuarios as u', 'u.id', '=', 'cc.cerrado_por')
                ->whereDate('cc.fecha', now()->toDateString())
                ->where('cc.estado', 'PENDIENTE_ENTREGA')
                ->orderBy('cc.created_at')
                ->limit(20)
                ->get(['cc.id', 'cc.efectivo_esperado', 'cc.created_at', 'u.nombre'])
                ->map(fn ($cc) => [
                    'id' => $cc->id,
                    'titulo' => $cc->nombre ?? 'Caja',
                    'detalle' => 'Entrega esperada ' . number_format((float) $cc->efectivo_esperado / 1000, 0, ',', '.') . ' mil',
                    'fecha' => $cc->created_at,
                    'modulo' => 'caja-general',
                ]);
            if ($items->isNotEmpty()) {
                $grupos[] = ['clave' => 'caja-general', 'titulo' => 'Cajas por recibir', 'tono' => 'atencion', 'items' => $items];
            }

            // --- Obligaciones de empleados pendientes ---
            $items = DB::table('obligaciones_empleado as o')
                ->join('usuarios as u', 'u.id', '=', 'o.empleado_id')
                ->where('o.estado', 'PENDIENTE')
                ->orderByDesc('o.created_at')
                ->limit(20)
                ->get(['o.id', 'o.concepto', 'o.saldo', 'o.created_at', 'u.nombre'])
                ->map(fn ($o) => [
                    'id' => $o->id,
                    'titulo' => $o->nombre,
                    'detalle' => $o->concepto . ' · saldo ' . number_format((float) $o->saldo / 1000, 0, ',', '.') . ' mil',
                    'fecha' => $o->created_at,
                    'modulo' => 'estado-cuenta',
                ]);
            if ($items->isNotEmpty()) {
                $grupos[] = ['clave' => 'estado-cuenta', 'titulo' => 'Obligaciones de empleados', 'tono' => 'info', 'items' => $items];
            }
        }

        $total = array_sum(array_map(fn ($g) => count($g['items']), $grupos));
        return ['total' => $total, 'grupos' => $grupos];
    }
}

<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Caja General (nivel administrativo de tesorería). Exclusivo del Administrador.
 * Consolida las cajas individuales del día usando SOLO los snapshots almacenados
 * en cada cierre (nunca recalcula desde los movimientos).
 */
class CajaGeneralController extends Controller
{
    private function soloAdmin(Request $request): void
    {
        abort_unless($request->user()?->esAdministrador(), 403, 'Acceso exclusivo del Administrador.');
    }

    private function auditar(Request $request, string $accion, ?int $entidadId, array $datos): void
    {
        DB::table('auditoria')->insert([
            'usuario_id'   => $request->user()->id,
            'accion'       => $accion,
            'entidad'      => 'caja_general',
            'entidad_id'   => $entidadId,
            'datos_nuevos' => json_encode($datos, JSON_UNESCAPED_UNICODE),
            'ip'           => $request->ip(),
            'user_agent'   => $request->userAgent(),
            'created_at'   => now(),
        ]);
    }

    /** Estado consolidado del día: cajas por estado y totales (desde snapshots). */
    public function estado(Request $request)
    {
        $this->soloAdmin($request);
        $fecha = $request->query('fecha', now()->toDateString());

        $cajas = DB::table('cierres_caja as cc')
            ->leftJoin('usuarios as u', 'u.id', '=', 'cc.cerrado_por')
            ->whereDate('cc.fecha', $fecha)
            ->orderBy('cc.estado')->orderBy('u.nombre')
            ->get([
                'cc.id', 'cc.estado', 'cc.rol_usuario',
                'cc.base_inicial', 'cc.cobros_efectivo', 'cc.cobros_transferencia',
                'cc.recaudo_seguros', 'cc.total_desembolsos', 'cc.total_gastos',
                'cc.movimiento_total', 'cc.efectivo_esperado', 'cc.efectivo_contado',
                'cc.efectivo_entregado', 'cc.diferencia', 'cc.diferencia_entrega',
                'cc.observacion', 'cc.observacion_entrega',
                'cc.hora_apertura', 'cc.hora_cierre',
                'u.nombre as usuario',
            ]);

        // ¿Hay cajas individuales aún abiertas hoy? (usuarios operativos sin cerrar)
        $cajasAbiertas = $this->contarCajasAbiertas($fecha);

        // Totales consolidados (solo desde snapshots de cajas que ya cerraron)
        $t = [
            'base_inicial' => 0, 'cobros_efectivo' => 0, 'cobros_transferencia' => 0,
            'recaudo_seguros' => 0, 'desembolsos' => 0, 'gastos' => 0,
            'movimiento_total' => 0, 'efectivo_esperado' => 0, 'efectivo_recibido' => 0, 'diferencia' => 0,
        ];
        foreach ($cajas as $c) {
            $t['base_inicial']         += (float) $c->base_inicial;
            $t['cobros_efectivo']      += (float) $c->cobros_efectivo;
            $t['cobros_transferencia'] += (float) $c->cobros_transferencia;
            $t['recaudo_seguros']      += (float) $c->recaudo_seguros;
            $t['desembolsos']          += (float) $c->total_desembolsos;
            $t['gastos']               += (float) $c->total_gastos;
            $t['movimiento_total']     += (float) $c->movimiento_total;
            $t['efectivo_esperado']    += (float) $c->efectivo_esperado;
            $t['efectivo_recibido']    += (float) ($c->efectivo_entregado ?? 0);
        }
        $t['diferencia'] = round($t['efectivo_recibido'] - $t['efectivo_esperado'], 2);
        foreach ($t as $k => $v) $t[$k] = round($v, 2);

        $conteo = [
            'abiertas'    => $cajasAbiertas,
            'cerradas'    => $cajas->where('estado', 'CERRADA')->count(),
            'pendientes'  => $cajas->where('estado', 'PENDIENTE_ENTREGA')->count(),
            'recibidas'   => $cajas->where('estado', 'RECIBIDA')->count(),
            'consolidadas'=> $cajas->where('estado', 'CONSOLIDADA')->count(),
        ];

        $yaConsolidado = DB::table('cierres_generales')->whereDate('fecha', $fecha)->exists();

        return response()->json(['data' => [
            'fecha'      => $fecha,
            'cajas'      => $cajas,
            'totales'    => $t,
            'conteo'     => $conteo,
            'puede_cerrar' => $cajasAbiertas === 0 && $conteo['pendientes'] === 0
                              && ($conteo['recibidas'] > 0) && ! $yaConsolidado,
            'ya_consolidado' => $yaConsolidado,
        ]]);
    }

    /** Cuenta usuarios operativos con caja abierta hoy (base registrada, sin cierre). */
    private function contarCajasAbiertas(string $fecha): int
    {
        // Usuarios con movimientos de caja hoy que NO tienen un cierre registrado
        $conMovimiento = DB::table('movimientos_caja')
            ->whereDate('fecha', $fecha)->distinct()->pluck('registrado_por');
        $cerrados = DB::table('cierres_caja')->whereDate('fecha', $fecha)->pluck('cerrado_por');
        return $conMovimiento->diff($cerrados)->count();
    }

    /** Confirma la recepción del dinero de una caja individual → estado RECIBIDA. */
    public function recibir(Request $request, int $cierre)
    {
        $this->soloAdmin($request);
        $data = $request->validate([
            'efectivo_entregado' => ['required', 'numeric', 'gte:0'],
            'observacion'        => ['nullable', 'string', 'max:500'],
        ]);

        $caja = DB::table('cierres_caja')->where('id', $cierre)->first();
        abort_unless($caja, 404, 'Caja no encontrada.');
        if (! in_array($caja->estado, ['PENDIENTE_ENTREGA', 'CERRADA'], true)) {
            return response()->json(['message' => 'Esta caja no está pendiente de entrega.'], 422);
        }

        $difEntrega = round($data['efectivo_entregado'] - (float) $caja->efectivo_esperado, 2);

        DB::table('cierres_caja')->where('id', $cierre)->update([
            'estado'              => 'RECIBIDA',
            'recibido_por'        => $request->user()->id,
            'recibido_at'         => now(),
            'efectivo_entregado'  => $data['efectivo_entregado'],
            'diferencia_entrega'  => $difEntrega,
            'observacion_entrega' => $data['observacion'] ?? null,
        ]);
        $this->auditar($request, 'CAJA_RECIBIDA', $cierre, [
            'efectivo_entregado' => $data['efectivo_entregado'],
            'diferencia_entrega' => $difEntrega,
            'usuario_caja'       => $caja->cerrado_por,
        ]);

        return response()->json(['message' => 'Caja recibida.', 'diferencia_entrega' => $difEntrega]);
    }

    /** Ejecuta el Cierre General del día (consolida todas las cajas RECIBIDAS). */
    public function cerrarGeneral(Request $request)
    {
        $this->soloAdmin($request);
        $data = $request->validate([
            'confirmacion' => ['required', 'string'],
            'observaciones'=> ['nullable', 'string', 'max:1000'],
        ]);
        if ($data['confirmacion'] !== 'CIERRE GENERAL') {
            return response()->json(['message' => 'Debes escribir exactamente "CIERRE GENERAL" para confirmar.'], 422);
        }

        $fecha = now()->toDateString();

        if (DB::table('cierres_generales')->whereDate('fecha', $fecha)->exists()) {
            return response()->json(['message' => 'El cierre general de hoy ya fue realizado.'], 422);
        }

        // Validación de tesorería: no cerrar si hay cajas abiertas o pendientes de entrega
        $abiertas = $this->contarCajasAbiertas($fecha);
        $pendientes = DB::table('cierres_caja')->whereDate('fecha', $fecha)->where('estado', 'PENDIENTE_ENTREGA')->count();
        if ($abiertas > 0 || $pendientes > 0) {
            return response()->json([
                'message' => 'No es posible realizar el Cierre General porque aún existen cajas pendientes de cierre o de entrega.',
            ], 422);
        }

        $recibidas = DB::table('cierres_caja as cc')->leftJoin('usuarios as u', 'u.id', '=', 'cc.cerrado_por')
            ->whereDate('cc.fecha', $fecha)->where('cc.estado', 'RECIBIDA')
            ->get(['cc.*', 'u.nombre as usuario_nombre']);
        if ($recibidas->isEmpty()) {
            return response()->json(['message' => 'No hay cajas recibidas para consolidar.'], 422);
        }

        // Consolidación desde snapshots (nunca recalcula desde movimientos)
        $tot = [
            'base' => 0, 'cef' => 0, 'ctr' => 0, 'seg' => 0, 'des_ef' => 0, 'des_tr' => 0,
            'gas' => 0, 'mov' => 0, 'esp' => 0, 'rec' => 0,
        ];
        $usuarios = [];
        foreach ($recibidas as $c) {
            $tot['base'] += (float) $c->base_inicial;
            $tot['cef']  += (float) $c->cobros_efectivo;
            $tot['ctr']  += (float) $c->cobros_transferencia;
            $tot['seg']  += (float) $c->recaudo_seguros;
            $tot['des_ef'] += (float) $c->total_desembolsos; // desglose fino en detalle por caja
            $tot['gas']  += (float) $c->total_gastos;
            $tot['mov']  += (float) $c->movimiento_total;
            $tot['esp']  += (float) $c->efectivo_esperado;
            $tot['rec']  += (float) ($c->efectivo_entregado ?? 0);
            $usuarios[] = $c->usuario_nombre;
        }
        $difGeneral = round($tot['rec'] - $tot['esp'], 2);

        $cierreId = DB::transaction(function () use ($request, $fecha, $recibidas, $tot, $difGeneral, $usuarios, $data) {
            $id = DB::table('cierres_generales')->insertGetId([
                'fecha'                          => $fecha,
                'cerrado_por'                    => $request->user()->id,
                'numero_cajas'                   => $recibidas->count(),
                'usuarios_incluidos'             => implode(', ', array_filter($usuarios)),
                'total_base_inicial'             => round($tot['base'], 2),
                'total_cobros_efectivo'          => round($tot['cef'], 2),
                'total_cobros_transferencia'     => round($tot['ctr'], 2),
                'total_recaudo_seguros'          => round($tot['seg'], 2),
                'total_desembolsos_efectivo'     => round($tot['des_ef'], 2),
                'total_desembolsos_transferencia'=> round($tot['des_tr'], 2),
                'total_gastos'                   => round($tot['gas'], 2),
                'movimiento_total'               => round($tot['mov'], 2),
                'total_efectivo_esperado'        => round($tot['esp'], 2),
                'total_efectivo_recibido'        => round($tot['rec'], 2),
                'diferencia_general'             => $difGeneral,
                'observaciones'                  => $data['observaciones'] ?? null,
                'estado'                         => 'CERRADO',
                'ip'                             => $request->ip(),
                'user_agent'                     => $request->userAgent(),
                'created_at'                     => now(),
            ]);

            // Todas las cajas recibidas pasan a CONSOLIDADA
            DB::table('cierres_caja')->whereDate('fecha', $fecha)->where('estado', 'RECIBIDA')
                ->update(['estado' => 'CONSOLIDADA', 'cierre_general_id' => $id]);

            return $id;
        });

        $this->auditar($request, 'CIERRE_GENERAL', $cierreId, [
            'numero_cajas' => $recibidas->count(),
            'usuarios'     => $usuarios,
            'diferencia_general' => $difGeneral,
        ]);

        return response()->json(['message' => 'Cierre General realizado.', 'id' => $cierreId], 201);
    }

    /** Historial de cierres generales (inmutable). */
    public function historial(Request $request)
    {
        $this->soloAdmin($request);
        $filas = DB::table('cierres_generales as cg')
            ->leftJoin('usuarios as u', 'u.id', '=', 'cg.cerrado_por')
            ->orderByDesc('cg.fecha')->limit(90)
            ->get(['cg.*', 'u.nombre as administrador']);
        return response()->json(['data' => $filas]);
    }
}

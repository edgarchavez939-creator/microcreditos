<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\GestionMora;
use App\Models\Solicitud;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Gestión de cobranza / mora: listado de créditos en mora con su última gestión,
 * registro de gestiones (llamada, visita, acuerdo/promesa de pago, observación) y
 * seguimiento. Respeta la visibilidad por rol (cobrador ve lo suyo, supervisor su área).
 */
class MoraController extends Controller
{
    /** Créditos visibles según el rol. */
    private function idsVisibles(Request $request)
    {
        $u = $request->user();
        $q = Solicitud::query();
        // Modelo territorial: filtrar por el área del CLIENTE (en vivo), no la del crédito.
        $areas = $u->areasVisibles();
        if ($areas !== null) {
            $q->whereIn('cliente_id',
                \Illuminate\Support\Facades\DB::table('clientes')->whereIn('area_id', $areas)->select('id'));
        }
        return $q->pluck('id');
    }

    /** Cartera en mora: un registro por crédito con días de atraso, saldo y última gestión. */
    public function cartera(Request $request)
    {
        $ids = $this->idsVisibles($request);

        // Agregado por crédito: saldo vencido y máximo de días en mora
        $creditos = DB::table('cuotas as q')
            ->join('solicitudes as s', 's.id', '=', 'q.solicitud_id')
            ->join('clientes as c', 'c.id', '=', 's.cliente_id')
            ->leftJoin('usuarios as u', 'u.id', '=', 's.cobrador_id')
            ->leftJoin('areas as a', 'a.id', '=', 's.area_id')
            ->whereIn('q.solicitud_id', $ids)
            ->whereDate('q.fecha_vencimiento', '<', now()->toDateString())
            ->whereIn('q.estado', ['PENDIENTE', 'PARCIAL', 'VENCIDA'])
            ->groupBy('s.id', 'c.id', 'c.nombres', 'c.apellidos', 'c.telefono_principal',
                      'c.direccion', 'c.latitud', 'c.longitud', 'u.nombre', 'a.nombre', 's.numero_credito')
            ->get([
                's.id as solicitud_id', 's.numero_credito',
                'c.id as cliente_id',
                DB::raw("TRIM(c.nombres || ' ' || c.apellidos) as cliente"),
                'c.telefono_principal as telefono', 'c.direccion',
                'c.latitud', 'c.longitud',
                'u.nombre as cobrador', 'a.nombre as area',
                DB::raw('SUM(q.valor - q.valor_pagado) as saldo_vencido'),
                DB::raw('MAX(CURRENT_DATE - q.fecha_vencimiento) as dias_mora'),
                DB::raw('COUNT(*) as cuotas_vencidas'),
            ]);

        // Última gestión y próxima promesa por cliente (una sola consulta)
        $clienteIds = $creditos->pluck('cliente_id')->unique()->values();
        $ultimaGestion = collect();
        $promesas = collect();
        if ($clienteIds->isNotEmpty()) {
            $ultimaGestion = DB::table('gestiones_mora')
                ->whereIn('cliente_id', $clienteIds)
                ->select('cliente_id', 'tipo', 'observacion', 'created_at',
                         DB::raw('ROW_NUMBER() OVER (PARTITION BY cliente_id ORDER BY created_at DESC) as rn'))
                ->get()->where('rn', 1)->keyBy('cliente_id');

            // Promesa vigente = acuerdo con fecha futura no cumplida
            $promesas = DB::table('gestiones_mora')
                ->whereIn('cliente_id', $clienteIds)
                ->where('tipo', 'ACUERDO_PAGO')
                ->whereNotNull('fecha_acuerdo')
                ->orderByDesc('fecha_acuerdo')
                ->get()->keyBy('cliente_id');
        }

        $filas = $creditos->map(function ($c) use ($ultimaGestion, $promesas) {
            $ug = $ultimaGestion->get($c->cliente_id);
            $pr = $promesas->get($c->cliente_id);
            return array_merge((array) $c, [
                'ultima_gestion' => $ug ? ['tipo' => $ug->tipo, 'observacion' => $ug->observacion, 'fecha' => $ug->created_at] : null,
                'promesa' => $pr ? ['fecha_acuerdo' => $pr->fecha_acuerdo, 'monto_acuerdo' => $pr->monto_acuerdo] : null,
            ]);
        })->sortByDesc('dias_mora')->values();

        return response()->json([
            'data' => $filas,
            'resumen' => [
                'creditos_mora'  => $filas->count(),
                'saldo_vencido'  => round((float) $filas->sum('saldo_vencido'), 2),
                'con_promesa'    => $filas->filter(fn ($f) => $f['promesa'] !== null)->count(),
            ],
        ]);
    }

    /** Historial de gestiones de un cliente. */
    public function historial(Request $request, int $cliente)
    {
        $filas = DB::table('gestiones_mora as g')
            ->leftJoin('usuarios as u', 'u.id', '=', 'g.registrado_por')
            ->where('g.cliente_id', $cliente)
            ->orderByDesc('g.created_at')
            ->get(['g.id', 'g.tipo', 'g.observacion', 'g.fecha_acuerdo', 'g.monto_acuerdo',
                   'g.latitud', 'g.longitud', 'g.created_at', 'u.nombre as registrado_por']);
        return response()->json(['data' => $filas]);
    }

    /** Registra una gestión de cobranza. */
    public function registrar(Request $request)
    {
        $data = $request->validate([
            'cliente_id'    => ['required', 'integer', 'exists:clientes,id'],
            'solicitud_id'  => ['nullable', 'integer', 'exists:solicitudes,id'],
            'tipo'          => ['required', 'in:LLAMADA,VISITA,ACUERDO_PAGO,OBSERVACION'],
            'observacion'   => ['required', 'string', 'max:1000'],
            'fecha_acuerdo' => ['nullable', 'date', 'after_or_equal:today'],
            'monto_acuerdo' => ['nullable', 'numeric', 'gt:0'],
            'latitud'       => ['nullable', 'numeric'],
            'longitud'      => ['nullable', 'numeric'],
        ]);

        // Una promesa de pago (ACUERDO_PAGO) requiere fecha
        if ($data['tipo'] === 'ACUERDO_PAGO' && empty($data['fecha_acuerdo'])) {
            return response()->json(['message' => 'Un acuerdo de pago requiere la fecha comprometida.'], 422);
        }

        $gestion = GestionMora::create(array_merge($data, [
            'registrado_por' => $request->user()->id,
        ]));

        // Auditoría
        DB::table('auditoria')->insert([
            'usuario_id'  => $request->user()->id,
            'accion'      => 'GESTION_MORA',
            'entidad'     => 'gestion_mora',
            'entidad_id'  => $gestion->id,
            'datos_nuevos'=> json_encode(['tipo' => $data['tipo'], 'cliente_id' => $data['cliente_id']], JSON_UNESCAPED_UNICODE),
            'ip'          => $request->ip(),
            'user_agent'  => $request->userAgent(),
            'created_at'  => now(),
        ]);

        return response()->json(['message' => 'Gestión registrada.', 'data' => $gestion], 201);
    }

    /** Promesas de pago próximas a vencer (seguimiento). */
    public function promesas(Request $request)
    {
        $ids = $this->idsVisibles($request);
        $clienteIds = DB::table('solicitudes')->whereIn('id', $ids)->pluck('cliente_id')->unique();

        $filas = DB::table('gestiones_mora as g')
            ->join('clientes as c', 'c.id', '=', 'g.cliente_id')
            ->leftJoin('usuarios as u', 'u.id', '=', 'g.registrado_por')
            ->where('g.tipo', 'ACUERDO_PAGO')
            ->whereNotNull('g.fecha_acuerdo')
            ->whereIn('g.cliente_id', $clienteIds)
            ->whereDate('g.fecha_acuerdo', '>=', now()->subDays(7)->toDateString())
            ->orderBy('g.fecha_acuerdo')
            ->get(['g.id', 'g.cliente_id', 'g.fecha_acuerdo', 'g.monto_acuerdo', 'g.observacion',
                   DB::raw("TRIM(c.nombres || ' ' || c.apellidos) as cliente"),
                   'c.telefono_principal as telefono', 'u.nombre as registrado_por']);

        return response()->json(['data' => $filas]);
    }
}

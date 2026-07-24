<?php
namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ReamortizarRequest;
use App\Http\Resources\RenovacionResource;
use App\Http\Resources\SolicitudResource;
use App\Models\Cliente;
use App\Models\Renovacion;
use App\Models\Solicitud;
use App\Services\ReamortizacionService;
use Illuminate\Http\Request;

class ReamortizacionController extends Controller
{
    public function __construct(private ReamortizacionService $svc) {}

    /** Saldo pendiente + previsualización opcional de una renovación. */
    public function saldo(Solicitud $solicitud, Request $request)
    {
        $this->authorize('view', $solicitud);

        $payload = ['saldo_pendiente' => $this->svc->saldoPendiente($solicitud)];

        if ($request->filled('nuevo_capital')) {
            $payload['previsualizacion'] = $this->svc->previsualizar(
                $solicitud,
                (float) $request->input('nuevo_capital'),
                (float) $request->input('porcentaje_seguro', 0),
                (float) $request->input('tasa_mensual', 0),
                (int) $request->input('plazo_meses', 1),
                (bool) $request->boolean('seguro_exonerado'),
            );
        }
        return response()->json(['data' => $payload]);
    }

    /** Ejecuta la reamortización (refinanciamiento interno). */
    public function reamortizar(ReamortizarRequest $request, Solicitud $solicitud)
    {
        $this->authorize('reamortizar', $solicitud);

        $nuevo = $this->svc->reamortizar($solicitud, $request->validated(), $request->user());

        return (new SolicitudResource($nuevo->load('cuotas')))
            ->additional(['renovacion' => new RenovacionResource(
                Renovacion::where('credito_nuevo_id', $nuevo->id)->first()
            )])
            ->response()->setStatusCode(201);
    }

    /** Historial completo padre-hijo del crédito. */
    public function historial(Solicitud $solicitud)
    {
        $this->authorize('view', $solicitud);
        $cadena = $this->svc->historial($solicitud);
        return SolicitudResource::collection($cadena);
    }

    public function verCupo(Cliente $cliente)
    {
        $this->authorize('view', $cliente);
        return response()->json(['data' => [
            'cupo_inicial'    => (float) $cliente->cupo_inicial,
            'cupo_disponible' => (float) $cliente->cupo_disponible,
        ]]);
    }

    public function setCupo(Cliente $cliente, Request $request)
    {
        // Solo administradores ajustan el cupo
        abort_unless($request->user()->esAdministrador(), 403, 'Solo un administrador puede ajustar el cupo.');
        $data = $request->validate([
            'cupo_inicial'    => ['required','numeric','gte:0'],
            'cupo_disponible' => ['nullable','numeric','gte:0'],
        ]);
        $cliente = $this->svc->definirCupo($cliente, $data['cupo_inicial'], $data['cupo_disponible'] ?? null);
        return response()->json(['data' => [
            'cupo_inicial'    => (float) $cliente->cupo_inicial,
            'cupo_disponible' => (float) $cliente->cupo_disponible,
        ]]);
    }

    /**
     * Carga todo lo necesario para reamortizar a partir del número de crédito:
     * cliente, saldo, cupo y condiciones actuales (elimina la digitación manual de IDs).
     */
    public function porNumero(\Illuminate\Http\Request $request)
    {
        $data = $request->validate(['numero' => ['required', 'string', 'max:30']]);

        $numero = strtoupper(trim($data['numero']));
        // Acepta "CR-000007", "000007" o "7"
        $s = \App\Models\Solicitud::query()
            ->when(str_starts_with($numero, 'CR-'),
                fn ($q) => $q->where('numero_credito', $numero),
                fn ($q) => $q->where('numero_credito', 'CR-'.str_pad(ltrim($numero, '0') ?: '0', 6, '0', STR_PAD_LEFT))
                             ->orWhere('id', (int) ltrim($numero, '0')))
            ->with('cliente:id,nombres,apellidos,telefono_principal,cupo_inicial')
            ->first();

        abort_unless($s, 404, 'No se encontró un crédito con ese número.');
        $this->authorize('reamortizar', $s);

        abort_unless(in_array($s->estado, ['ACTIVO', 'EN_MORA', 'DESEMBOLSADO', 'MIGRADO'], true), 422,
            "El crédito está en estado {$s->estado}; solo se reamortizan créditos vigentes.");

        $saldo = (float) \Illuminate\Support\Facades\DB::table('cuotas')
            ->where('solicitud_id', $s->id)
            ->whereIn('estado', ['PENDIENTE', 'PARCIAL', 'VENCIDA'])
            ->sum(\Illuminate\Support\Facades\DB::raw('valor - valor_pagado'));

        $reduccion = (float) \App\Models\Parametro::valor('cupo.reduccion_por_renovacion', 100000);
        $renovaciones = \Illuminate\Support\Facades\DB::table('renovaciones')->where('cliente_id', $s->cliente_id)->count();
        $cupoDisponible = max((float) ($s->cliente->cupo_inicial ?? 0) - $reduccion * $renovaciones, 0);

        return response()->json(['data' => [
            'solicitud_id'    => $s->id,
            'numero_credito'  => $s->numero_credito,
            'estado'          => $s->estado,
            'cliente_id'      => $s->cliente_id,
            'cliente'         => trim("{$s->cliente->nombres} {$s->cliente->apellidos}"),
            'telefono'        => $s->cliente->telefono_principal,
            'saldo_pendiente' => round($saldo, 2),
            'cupo_disponible' => $cupoDisponible,
            'condiciones'     => [
                'tasa_interes' => (float) $s->tasa_interes,
                'modalidad'    => $s->modalidad,
                'plazo_meses'  => (int) ($s->plazo_meses ?? 0),
                'valor_cuota'  => (float) $s->valor_cuota,
            ],
        ]]);
    }
}

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
}

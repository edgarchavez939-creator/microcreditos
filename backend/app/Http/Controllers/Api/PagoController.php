<?php
namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StorePagoRequest;
use App\Http\Resources\SolicitudResource;
use App\Models\Solicitud;
use App\Services\PaymentService;

class PagoController extends Controller
{
    public function store(StorePagoRequest $request, PaymentService $svc)
    {
        $data = $request->validated();
        $credito = Solicitud::findOrFail($data['solicitud_id']);
        $this->authorize('pay', $credito);

        $pago = $svc->registrarPago($credito, $data, $request->user());

        // Devolver el crédito actualizado (cuotas + saldo) para refrescar la UI
        return response()->json([
            'pago' => [
                'id'    => $pago->id,
                'valor' => (float) $pago->valor,
                'fecha' => $pago->fecha?->toDateString(),
                'metodo'=> $pago->metodo,
            ],
            'credito' => new SolicitudResource($credito->fresh()->load('cuotas')),
        ], 201);
    }

    /** Anula un pago mal digitado (solo administrador, con clave especial). */
    public function destroy(\Illuminate\Http\Request $request, \App\Models\Pago $pago, \App\Services\PaymentService $svc)
    {
        abort_unless($request->user()->esAdministrador(), 403, 'Solo el administrador puede anular pagos.');
        $request->validate(['clave' => ['required', 'string']]);
        if ($request->input('clave') !== config('app.credito_delete_key')) {
            abort(422, 'Clave de anulación incorrecta.');
        }

        $svc->revertirPago($pago);

        return response()->json(['message' => 'Pago anulado y crédito recalculado.']);
    }
}

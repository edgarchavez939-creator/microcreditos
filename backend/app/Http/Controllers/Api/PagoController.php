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

    /** Anula un pago mal digitado. Autorización por el motor de permisos + clave OTP. */
    public function destroy(\Illuminate\Http\Request $request, \App\Models\Pago $pago, \App\Services\PaymentService $svc)
    {
        // La ruta ya exige la acción 'pagos.anular' (motor de permisos), que por defecto
        // tienen administrador y supervisor y es configurable por el administrador.
        // No se cablea el rol aquí para no contradecir esa configuración.
        $request->validate([
            'otp'    => ['required', 'string', 'digits:6'],
            'motivo' => ['nullable', 'string', 'max:255'],
        ]);
        if (! app(\App\Services\OtpService::class)->consumir($request->user(), 'ANULAR_PAGO', $request->input('otp'))) {
            abort(422, 'Código de seguridad incorrecto, vencido o ya utilizado. Genera uno nuevo.');
        }

        $svc->revertirPago($pago, $request->user(), $request->input('motivo'));

        return response()->json(['message' => 'Pago anulado y crédito recalculado.']);
    }
}

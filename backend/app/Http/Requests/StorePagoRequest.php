<?php
namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StorePagoRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'solicitud_id' => ['required', 'integer', 'exists:solicitudes,id'],
            'cuota_id'     => ['nullable', 'integer', 'exists:cuotas,id'],
            'valor'        => ['required', 'numeric', 'gt:0'],
            'metodo'       => ['required', Rule::in(['EFECTIVO', 'TRANSFERENCIA'])],
            'fecha'        => ['nullable', 'date'],
            'observaciones'=> ['nullable', 'string', 'max:500'],
            'client_uuid'  => ['nullable', 'uuid'],
            // Comprobante de transferencia (imagen, opcional, máx 2MB)
            'comprobante'                 => ['nullable', 'array'],
            'comprobante.nombre'          => ['required_with:comprobante', 'string', 'max:255'],
            'comprobante.mime'            => ['required_with:comprobante', Rule::in(['image/jpeg', 'image/png', 'image/webp'])],
            'comprobante.tamano'          => ['required_with:comprobante', 'integer', 'max:2097152'],
            'comprobante.contenido_base64'=> ['required_with:comprobante', 'string'],
        ];
    }
}

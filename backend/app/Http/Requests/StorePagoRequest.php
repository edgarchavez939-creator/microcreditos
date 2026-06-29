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
        ];
    }
}

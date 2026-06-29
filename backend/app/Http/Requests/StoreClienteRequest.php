<?php
namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreClienteRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        // En edición, ignorar el propio documento en la regla unique.
        $clienteId = $this->route('cliente')?->id;

        return [
            // Personales
            'nombres'             => ['required', 'string', 'max:120'],
            'apellidos'           => ['required', 'string', 'max:120'],
            'tipo_documento'      => ['required', Rule::in(['CC', 'CE', 'TI', 'NIT', 'PASAPORTE'])],
            'numero_documento'    => [
                'required', 'string', 'max:40',
                Rule::unique('clientes')->where(fn ($q) => $q->where('tipo_documento', $this->input('tipo_documento')))
                    ->ignore($clienteId),
            ],
            'fecha_nacimiento'    => ['nullable', 'date'],
            'genero'              => ['nullable', Rule::in(['M', 'F', 'OTRO'])],
            'estado_civil'        => ['nullable', Rule::in(['SOLTERO', 'CASADO', 'UNION_LIBRE', 'DIVORCIADO', 'VIUDO'])],
            // Contacto
            'telefono_principal'  => ['nullable', 'string', 'max:30'],
            'telefono_secundario' => ['nullable', 'string', 'max:30'],
            'correo'              => ['nullable', 'email', 'max:180'],
            // Dirección
            'area_id'             => ['required', 'integer', 'exists:areas,id'],
            'cobrador_id'         => ['nullable', 'integer', 'exists:usuarios,id'],
            'direccion'           => ['nullable', 'string', 'max:255'],
            'barrio'              => ['nullable', 'string', 'max:120'],
            'ciudad'              => ['nullable', 'string', 'max:120'],
            'referencia_ubicacion'=> ['nullable', 'string'],
            // GPS
            'latitud'             => ['nullable', 'numeric', 'between:-90,90'],
            'longitud'            => ['nullable', 'numeric', 'between:-180,180'],
            // Laboral
            'empresa'             => ['nullable', 'string', 'max:150'],
            'cargo'               => ['nullable', 'string', 'max:120'],
            'antiguedad_meses'    => ['nullable', 'integer', 'min:0'],
            'salario'             => ['nullable', 'numeric', 'min:0'],
            'direccion_laboral'   => ['nullable', 'string', 'max:255'],
            'telefono_laboral'    => ['nullable', 'string', 'max:30'],
            // Referencias
            'referencias'                 => ['nullable', 'array'],
            'referencias.*.tipo'          => ['required_with:referencias', Rule::in(['FAMILIAR', 'PERSONAL'])],
            'referencias.*.nombre'        => ['required_with:referencias', 'string', 'max:150'],
            'referencias.*.telefono'      => ['nullable', 'string', 'max:30'],
            'referencias.*.parentesco'    => ['nullable', 'string', 'max:60'],
        ];
    }
}

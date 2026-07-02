<?php
namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreClienteRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        $clienteId = $this->route('cliente')?->id;

        return [
            // Personales (obligatorios)
            'nombres'             => ['required', 'string', 'max:120'],
            'apellidos'           => ['required', 'string', 'max:120'],
            'tipo_documento'      => ['required', Rule::in(['CC', 'CE', 'TI', 'NIT', 'PASAPORTE'])],
            'numero_documento'    => [
                'required', 'string', 'regex:/^[0-9]+$/', 'max:40',
                Rule::unique('clientes')->where(fn ($q) => $q->where('tipo_documento', $this->input('tipo_documento')))
                    ->ignore($clienteId),
            ],
            'fecha_nacimiento'    => ['required', 'date'],
            'fecha_expedicion_documento' => ['required', 'date', 'before_or_equal:today'],
            'lugar_expedicion_documento' => ['required', 'string', 'max:150'],
            'lugar_nacimiento'           => ['required', 'string', 'max:150'],
            'genero'              => ['required', Rule::in(['M', 'F', 'OTRO'])],
            'estado_civil'        => ['required', Rule::in(['SOLTERO', 'CASADO', 'UNION_LIBRE', 'DIVORCIADO', 'VIUDO'])],
            // Contacto (obligatorios)
            'telefono_principal'  => ['required', 'string', 'regex:/^[0-9]{7,10}$/'],
            'correo'              => ['required', 'email', 'max:180'],
            // Ubicación (obligatorios)
            'area_id'             => ['required', 'integer', 'exists:areas,id'],
            'cobrador_id'         => ['nullable', 'integer', 'exists:usuarios,id'],
            'direccion'           => ['required', 'string', 'max:255'],
            'barrio'              => ['required', 'string', 'max:120'],
            'referencia_ubicacion'=> ['required', 'string'],
            'latitud'             => ['required', 'numeric', 'between:-90,90'],
            'longitud'            => ['required', 'numeric', 'between:-180,180'],
            // Laboral (obligatorios)
            'empresa'             => ['required', 'string', 'max:150'],
            'cargo'               => ['required', 'string', 'max:120'],
            'antiguedad_meses'    => ['required', 'integer', 'min:0'],
            'salario'             => ['required', 'numeric', 'min:0'],
            'direccion_laboral'   => ['required', 'string', 'max:255'],
            // Referencias (opcionales)
            'referencias'                 => ['nullable', 'array'],
            'referencias.*.tipo'          => ['required_with:referencias', Rule::in(['FAMILIAR', 'PERSONAL'])],
            'referencias.*.nombre'        => ['required_with:referencias', 'string', 'max:150'],
            'referencias.*.telefono'      => ['nullable', 'string', 'max:30'],
            'referencias.*.parentesco'    => ['nullable', 'string', 'max:60'],
            // Soportes (opcionales): imágenes o PDF, máx 2MB c/u
            'documentos'                  => ['nullable', 'array', 'max:6'],
            'documentos.*.nombre'         => ['required_with:documentos', 'string', 'max:255'],
            'documentos.*.mime'           => ['required_with:documentos', Rule::in(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])],
            'documentos.*.tamano'         => ['required_with:documentos', 'integer', 'max:2097152'], // 2 MB
            'documentos.*.contenido_base64' => ['required_with:documentos', 'string'],
        ];
    }

    public function messages(): array
    {
        return [
            'numero_documento.regex'   => 'El documento debe contener solo números.',
            'telefono_principal.regex' => 'El teléfono debe tener entre 7 y 10 dígitos (solo números).',
            'documentos.*.mime.in'     => 'Solo se permiten imágenes (JPG, PNG, WEBP) o PDF.',
            'documentos.*.tamano.max'  => 'Cada soporte debe pesar máximo 2 MB.',
        ];
    }
}

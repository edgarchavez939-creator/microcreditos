<?php
namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class StoreSolicitudRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'cliente_id'          => ['required','integer','exists:clientes,id'],
            'area_id'             => ['required','integer','exists:areas,id'],
            'producto_id'         => ['nullable','integer','exists:productos,id'],
            'es_venta_financiada' => ['boolean'],
            'capital_solicitado'  => ['required','numeric','gt:0'],
            'monto_aprobado'      => ['required','numeric','gt:0'],
            'tasa_interes'        => ['required','numeric','gte:0'],
            'tipo_interes'        => ['nullable','in:FIJO,SOBRE_SALDO'],
            'modalidad'           => ['required','in:DIARIO,SEMANAL,QUINCENAL,MENSUAL'],
            'numero_cuotas'       => ['required','integer','min:1'],
            'fecha_primer_pago'   => ['nullable','date'],
            'porcentaje_seguro'   => ['required_unless:seguro_exonerado,true','numeric','between:0,0.10'],
            'seguro_exonerado'    => ['boolean'],
            'motivo_exoneracion'  => ['required_if:seguro_exonerado,true','nullable','string','min:5'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function ($v) {
            $exonerado = (bool) $this->input('seguro_exonerado', false);
            $pct = (float) $this->input('porcentaje_seguro', 0);
            // Si NO exonerado y hay seguro, el rango debe ser 5%–10%
            if (! $exonerado && $pct > 0 && ($pct < 0.05 || $pct > 0.10)) {
                $v->errors()->add('porcentaje_seguro', 'El seguro debe estar entre 5% y 10%.');
            }
        });
    }
}

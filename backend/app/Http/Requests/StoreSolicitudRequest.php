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
            'area_id'             => ['nullable','integer','exists:areas,id'],
            'producto_id'         => ['nullable','integer','exists:productos,id'],
            'producto_financiero_id' => ['nullable','integer','exists:productos_financieros,id'],
            'valor_pactado'       => ['nullable','numeric','gt:0'],
            'credito_origen_id'   => ['nullable','integer','exists:solicitudes,id'],
            'es_venta_financiada' => ['boolean'],
            'capital_solicitado'  => ['required','numeric','gt:0'],
            'tasa_interes'        => ['nullable','numeric','gte:0'],  // el motor la normaliza según el producto
            'tipo_interes'        => ['nullable','in:FIJO,SOBRE_SALDO'],
            'modalidad'           => ['required','in:DIARIO,SEMANAL,QUINCENAL,MENSUAL'],
            'plazo_meses'         => ['required','integer','min:1','max:60'],
            'fecha_primer_pago'   => ['nullable','date'],
            'porcentaje_seguro'   => ['nullable','numeric','between:0,0.10'],  // el motor lo normaliza según el producto
            'seguro_exonerado'    => ['boolean'],
            'motivo_exoneracion'  => ['required_if:seguro_exonerado,true','nullable','string','min:5'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function ($v) {
            $exonerado = (bool) $this->input('seguro_exonerado', false);
            $pct = (float) $this->input('porcentaje_seguro', 0);
            // Rango configurable (no hardcodeado): usa los parámetros del sistema.
            $min = (float) \App\Models\Parametro::valor('seguro.porcentaje_min', 0.05);
            $max = (float) \App\Models\Parametro::valor('seguro.porcentaje_max', 0.10);
            if (! $exonerado && $pct > 0 && ($pct < $min || $pct > $max)) {
                $pctMin = rtrim(rtrim(number_format($min * 100, 1), '0'), '.');
                $pctMax = rtrim(rtrim(number_format($max * 100, 1), '0'), '.');
                $v->errors()->add('porcentaje_seguro', "El seguro debe estar entre {$pctMin}% y {$pctMax}%.");
            }
        });
    }
}

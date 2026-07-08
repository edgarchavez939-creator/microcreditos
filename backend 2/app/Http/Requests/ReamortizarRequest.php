<?php
namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ReamortizarRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'nuevo_capital'      => ['required','numeric','gt:0'],
            'tasa_mensual'       => ['required','numeric','gte:0'],
            'plazo_meses'        => ['required','integer','min:1'],
            'modalidad'          => ['nullable','in:DIARIO,SEMANAL,QUINCENAL,MENSUAL'],
            'fecha_primer_pago'  => ['nullable','date'],
            'seguro_exonerado'   => ['boolean'],
            'porcentaje_seguro'  => ['required_unless:seguro_exonerado,true','numeric','between:0,0.10'],
            'motivo_exoneracion' => ['required_if:seguro_exonerado,true','nullable','string','min:5'],
        ];
    }
}

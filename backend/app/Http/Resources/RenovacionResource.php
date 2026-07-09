<?php
namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class RenovacionResource extends JsonResource
{
    public function toArray($request): array
    {
        return [
            'id'                      => $this->id,
            'credito_origen_id'       => $this->credito_origen_id,
            'credito_nuevo_id'        => $this->credito_nuevo_id,
            'saldo_refinanciado'      => (float) $this->saldo_refinanciado,
            'capital_aprobado'        => (float) $this->capital_aprobado,
            'porcentaje_seguro'       => (float) $this->porcentaje_seguro,
            'valor_seguro'            => (float) $this->valor_seguro,
            'valor_desembolsado'      => (float) $this->valor_desembolsado,
            'dinero_adicional'        => (float) $this->dinero_adicional,
            'recibido_cliente'        => (float) $this->recibido_cliente,
            'interes_generado'        => (float) $this->interes_generado,
            'total_deuda_nueva'       => (float) $this->total_deuda_nueva,
            'cupo_disponible_despues' => (float) $this->cupo_disponible_despues,
            'fecha_renovacion'        => $this->fecha_renovacion,
        ];
    }
}

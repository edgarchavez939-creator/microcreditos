<?php
namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class CuotaResource extends JsonResource
{
    public function toArray($request): array
    {
        return [
            'numero_cuota'      => $this->numero_cuota,
            'fecha_vencimiento' => $this->fecha_vencimiento?->toDateString(),
            'valor'             => (float) $this->valor,
            'valor_pagado'      => (float) $this->valor_pagado,
            'saldo'             => (float) $this->saldo,
            'estado'            => $this->estado,
            'dias_mora'         => $this->dias_mora,
        ];
    }
}

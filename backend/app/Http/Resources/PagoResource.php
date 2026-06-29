<?php
namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class PagoResource extends JsonResource
{
    public function toArray($request): array
    {
        return [
            'id'            => $this->id,
            'fecha'         => $this->fecha?->toDateString(),
            'hora'          => $this->created_at?->format('H:i'),
            'valor'         => (float) $this->valor,
            'metodo'        => $this->metodo,
            'observaciones' => $this->observaciones,
            'registrado_por'=> $this->whenLoaded('registrador', fn () => $this->registrador?->nombre),
        ];
    }
}

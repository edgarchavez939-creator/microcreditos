<?php
namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class UsuarioResource extends JsonResource
{
    public function toArray($request): array
    {
        return [
            'id'    => $this->id,
            'uuid'  => $this->uuid,
            'nombre'=> $this->nombre,
            'email' => $this->email,
            'rol'   => $this->rol,
            'twofa_enabled' => $this->twofa_enabled,
            'areas' => $this->whenLoaded('areas', fn () => $this->areas->pluck('nombre')),
        ];
    }
}

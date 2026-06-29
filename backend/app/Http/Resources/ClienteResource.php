<?php
namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class ClienteResource extends JsonResource
{
    public function toArray($request): array
    {
        return [
            'id'                  => $this->id,
            'uuid'                => $this->uuid,
            'nombres'             => $this->nombres,
            'apellidos'           => $this->apellidos,
            'tipo_documento'      => $this->tipo_documento,
            'numero_documento'    => $this->numero_documento,
            'fecha_nacimiento'    => $this->fecha_nacimiento?->toDateString(),
            'genero'              => $this->genero,
            'estado_civil'        => $this->estado_civil,
            'telefono_principal'  => $this->telefono_principal,
            'telefono_secundario' => $this->telefono_secundario,
            'correo'              => $this->correo,
            'area_id'             => $this->area_id,
            'area'                => $this->whenLoaded('area', fn () => $this->area->nombre),
            'cobrador_id'         => $this->cobrador_id,
            'cobrador'            => $this->whenLoaded('cobrador', fn () => $this->cobrador?->nombre),
            'direccion'           => $this->direccion,
            'barrio'              => $this->barrio,
            'ciudad'              => $this->ciudad,
            'referencia_ubicacion'=> $this->referencia_ubicacion,
            'latitud'             => $this->latitud !== null ? (float) $this->latitud : null,
            'longitud'            => $this->longitud !== null ? (float) $this->longitud : null,
            'empresa'             => $this->empresa,
            'cargo'               => $this->cargo,
            'antiguedad_meses'    => $this->antiguedad_meses,
            'salario'             => $this->salario !== null ? (float) $this->salario : null,
            'direccion_laboral'   => $this->direccion_laboral,
            'telefono_laboral'    => $this->telefono_laboral,
            'cupo_disponible'     => (float) $this->cupo_disponible,
            'activo'              => (bool) $this->activo,
            'referencias'         => $this->whenLoaded('referencias', fn () => $this->referencias->map(fn ($r) => [
                'tipo' => $r->tipo, 'nombre' => $r->nombre, 'telefono' => $r->telefono, 'parentesco' => $r->parentesco,
            ])),
        ];
    }
}

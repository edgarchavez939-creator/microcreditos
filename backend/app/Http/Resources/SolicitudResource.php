<?php
namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class SolicitudResource extends JsonResource
{
    public function toArray($request): array
    {
        return [
            'id'                 => $this->id,
            'uuid'               => $this->uuid,
            'cliente_id'         => $this->cliente_id,
            'estado'             => $this->estado,
            'capital_solicitado' => (float) $this->capital_solicitado,
            'monto_aprobado'     => (float) $this->monto_aprobado,
            'tasa_interes'       => (float) $this->tasa_interes,
            'interes'            => (float) $this->interes,
            'porcentaje_seguro'  => (float) $this->porcentaje_seguro,
            'valor_seguro'       => (float) $this->valor_seguro,
            'monto_desembolsado' => (float) $this->monto_desembolsado,
            'total_recaudar'     => (float) $this->total_recaudar,
            'seguro_exonerado'   => (bool) $this->seguro_exonerado,
            'motivo_exoneracion' => $this->motivo_exoneracion,
            'modalidad'          => $this->modalidad,
            'numero_cuotas'      => $this->numero_cuotas,
            'valor_cuota'        => (float) $this->valor_cuota,
            'fecha_aprobacion'   => $this->fecha_aprobacion,
            'plazo_meses'        => $this->plazo_meses,
            'credito_origen_id'  => $this->credito_origen_id,
            'saldo_refinanciado' => (float) $this->saldo_refinanciado,
            'total_pagado'       => (float) $this->total_pagado,
            'saldo_pendiente'    => $this->saldoPendiente(),
            'cuotas'             => CuotaResource::collection($this->whenLoaded('cuotas')),
        ];
    }
}

<?php
namespace App\Jobs;

use App\Models\Cuota;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Carbon;

class CalcularMoraJob implements ShouldQueue
{
    use Dispatchable, Queueable, SerializesModels;

    public function handle(): void
    {
        $hoy = Carbon::today();
        Cuota::whereIn('estado', ['PENDIENTE','PARCIAL'])
            ->whereDate('fecha_vencimiento', '<', $hoy)
            ->chunkById(500, function ($cuotas) use ($hoy) {
                foreach ($cuotas as $cuota) {
                    $dias = $cuota->fecha_vencimiento->diffInDays($hoy);
                    $cuota->update(['dias_mora' => $dias, 'estado' => 'VENCIDA']);
                }
            });
    }
}

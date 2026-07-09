<?php
namespace App\Jobs;

use App\Models\Solicitud;
use App\Services\LoanService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class GenerarCronogramaJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(public int $solicitudId) {}

    public function handle(LoanService $loans): void
    {
        $solicitud = Solicitud::findOrFail($this->solicitudId);
        $loans->generarCronograma($solicitud);
    }
}

<?php

namespace App\Console\Commands;

use App\Models\Transferencia;
use App\Services\PaymentService;
use Illuminate\Console\Command;

class SanearTransferenciasRechazadas extends Command
{
    protected $signature = 'transferencias:sanear';

    protected $description = 'Revierte los pagos de transferencias que fueron rechazadas antes de existir la reversión automática.';

    public function handle(PaymentService $pagos): int
    {
        $pendientes = Transferencia::where('estado', 'RECHAZADO')
            ->whereNotNull('pago_id')
            ->get();

        if ($pendientes->isEmpty()) {
            $this->info('No hay transferencias rechazadas con pagos por revertir.');
            return self::SUCCESS;
        }

        foreach ($pendientes as $t) {
            try {
                $pagos->revertirPagoDeTransferencia($t);
                $this->info("Transferencia #{$t->id}: pago revertido.");
            } catch (\Throwable $e) {
                $this->error("Transferencia #{$t->id}: ".$e->getMessage());
            }
        }

        return self::SUCCESS;
    }
}

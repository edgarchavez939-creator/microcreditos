<?php

namespace App\Console\Commands;

use App\Services\MoraService;
use Illuminate\Console\Command;

class MarcarMora extends Command
{
    protected $signature = 'mora:marcar';
    protected $description = 'Marca cuotas vencidas y sincroniza créditos EN_MORA/ACTIVO.';

    public function handle(MoraService $mora): int
    {
        $mora->sincronizar();
        $this->info('Estados de mora sincronizados.');
        return self::SUCCESS;
    }
}

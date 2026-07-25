<?php

namespace App\Console\Commands;

use App\Services\SeguimientoService;
use Illuminate\Console\Command;

/**
 * Depura las ubicaciones GPS antiguas del seguimiento en vivo.
 *
 * El rastreo es un dato OPERATIVO del día (saber dónde está el equipo ahora y
 * qué recorrido lleva hoy), no un histórico contable. Conservarlo indefinidamente
 * infla la base de datos y acumula datos personales de ubicación sin necesidad.
 *
 * Uso:  php artisan ubicaciones:depurar            (retención por defecto: 7 días)
 *       php artisan ubicaciones:depurar --dias=15
 *       php artisan ubicaciones:depurar --simular  (muestra cuántos borraría)
 */
class DepurarUbicaciones extends Command
{
    protected $signature = 'ubicaciones:depurar {--dias= : Días de historial a conservar} {--simular : No borra, solo informa}';
    protected $description = 'Elimina las ubicaciones GPS anteriores al período de retención.';

    public function handle(SeguimientoService $seguimiento): int
    {
        $dias = (int) ($this->option('dias') ?: config('seguimiento.dias_retencion', 7));
        $dias = max($dias, 1);
        $limite = now()->subDays($dias)->startOfDay();

        if ($this->option('simular')) {
            $n = $seguimiento->contarDepurables($dias);
            $this->info("Simulación: se eliminarían {$n} ubicación(es) anteriores a {$limite->toDateTimeString()}.");
            return self::SUCCESS;
        }

        $borradas = $seguimiento->depurar($dias);
        $this->info("Depuración completada: {$borradas} ubicación(es) eliminada(s). Se conservan los últimos {$dias} día(s).");

        return self::SUCCESS;
    }
}

<?php
use App\Jobs\CalcularMoraJob;
use Illuminate\Support\Facades\Schedule;

// Cálculo de mora diario a la 1:00 AM (hora del servidor)
Schedule::job(new CalcularMoraJob)->dailyAt('01:00');

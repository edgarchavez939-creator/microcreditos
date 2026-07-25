<?php
use App\Jobs\CalcularMoraJob;
use Illuminate\Support\Facades\Schedule;

// Cálculo de mora diario a la 1:00 AM (hora del servidor)
Schedule::job(new CalcularMoraJob)->dailyAt('01:00');

// Depuración diaria del seguimiento GPS a las 2:15 AM (retención: 7 días).
// NOTA: el plan actual de Render no ejecuta cron, así que además la depuración
// se dispara de forma oportunista una vez al día desde el reporte de ubicación
// (MapaController). Cuando se habilite un cron real, esta línea basta.
Schedule::command('ubicaciones:depurar')->dailyAt('02:15');

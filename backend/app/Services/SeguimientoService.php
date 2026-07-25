<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * SEGUIMIENTO EN VIVO — lógica de dominio del rastreo territorial.
 *
 * Concentra aquí (y no en el controlador) el cálculo geográfico, la simplificación
 * del recorrido y la política de retención, para que el controlador HTTP y el
 * comando de consola compartan exactamente el mismo comportamiento.
 */
class SeguimientoService
{
    /**
     * Distancia aproximada en metros entre dos coordenadas (equirectangular).
     * Precisión más que suficiente a escala urbana y mucho más barata que Haversine.
     */
    public function distanciaMetros(float $lat1, float $lon1, float $lat2, float $lon2): float
    {
        $r = 6371000.0;                       // radio terrestre en metros
        $x = deg2rad($lon2 - $lon1) * cos(deg2rad(($lat1 + $lat2) / 2));
        $y = deg2rad($lat2 - $lat1);

        return sqrt($x * $x + $y * $y) * $r;
    }

    /**
     * ¿Debe guardarse este punto? Aplica los dos filtros anti-ruido:
     *  - intervalo mínimo entre puntos;
     *  - reposo: sin desplazamiento significativo dentro de la ventana definida.
     * Devuelve true cuando el punto aporta información nueva al recorrido.
     */
    public function debeRegistrar(?object $ultimo, float $lat, float $lon): bool
    {
        if (! $ultimo) return true;

        // Cálculo explícito por marca de tiempo: no depende del signo que devuelva
        // diffInSeconds, que cambió entre versiones de Carbon.
        $segundos = now()->timestamp - \Illuminate\Support\Carbon::parse($ultimo->reportada_at)->timestamp;

        if ($segundos < (int) config('seguimiento.intervalo_minimo_seg', 45)) {
            return false;
        }

        $metros = $this->distanciaMetros(
            (float) $ultimo->latitud, (float) $ultimo->longitud, $lat, $lon
        );

        $quieto = $metros < (int) config('seguimiento.movimiento_minimo_m', 25)
            && $segundos < (int) config('seguimiento.ventana_reposo_seg', 300);

        return ! $quieto;
    }

    /**
     * Reduce el recorrido a un máximo de $max puntos repartidos uniformemente,
     * conservando SIEMPRE el primero y el último (inicio de jornada y posición
     * actual). El trazo en pantalla es visualmente idéntico.
     */
    public function simplificarRecorrido($puntos, ?int $max = null): array
    {
        $max = $max ?? (int) config('seguimiento.max_puntos_recorrido', 120);
        $lista = $puntos->values();
        $total = $lista->count();

        if ($total <= $max || $max < 2) {
            return $lista->map(fn ($p) => [(float) $p->latitud, (float) $p->longitud])->all();
        }

        $paso = ($total - 1) / ($max - 1);
        $salida = [];
        for ($i = 0; $i < $max - 1; $i++) {
            $p = $lista[(int) round($i * $paso)];
            $salida[] = [(float) $p->latitud, (float) $p->longitud];
        }
        $ultimo = $lista->last();
        $salida[] = [(float) $ultimo->latitud, (float) $ultimo->longitud];

        return $salida;
    }

    /**
     * DEPURACIÓN: borra las ubicaciones anteriores al período de retención.
     * Devuelve cuántas filas se eliminaron.
     */
    public function depurar(?int $dias = null): int
    {
        $dias = max($dias ?? (int) config('seguimiento.dias_retencion', 7), 1);
        $limite = now()->subDays($dias)->startOfDay();

        return DB::table('ubicaciones_empleado')->where('reportada_at', '<', $limite)->delete();
    }

    /** Cuántas filas borraría la depuración (para el modo simulación del comando). */
    public function contarDepurables(?int $dias = null): int
    {
        $dias = max($dias ?? (int) config('seguimiento.dias_retencion', 7), 1);
        $limite = now()->subDays($dias)->startOfDay();

        return DB::table('ubicaciones_empleado')->where('reportada_at', '<', $limite)->count();
    }

    /**
     * Ejecuta la depuración como máximo UNA vez al día.
     *
     * El plan actual de Render no ejecuta cron, así que el programador de Laravel
     * no se dispara solo; esta llamada oportunista (desde el reporte de ubicación,
     * que ocurre constantemente durante la jornada) garantiza la retención. La
     * marca en caché evita que cada reporte lance un borrado.
     */
    public function depurarUnaVezAlDia(): void
    {
        $clave = 'depuracion:ubicaciones:' . now()->toDateString();
        if (Cache::get($clave)) return;

        // Se marca ANTES de borrar: si el borrado falla, no se reintenta en bucle.
        Cache::put($clave, true, now()->addDay());

        try {
            $this->depurar();
        } catch (\Throwable $e) {
            report($e);   // nunca debe romper el reporte de ubicación del cobrador
        }
    }
}

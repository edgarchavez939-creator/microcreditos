<?php
namespace App\Providers;

use App\Models\Cliente;
use App\Models\Pago;
use App\Models\Solicitud;
use App\Models\Usuario;
use App\Policies\SolicitudPolicy;
use App\Support\AuditObserver;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        Gate::policy(Solicitud::class, SolicitudPolicy::class);

        foreach ([Cliente::class, Solicitud::class, Pago::class, Usuario::class] as $modelo) {
            $modelo::observe(AuditObserver::class);
        }

        RateLimiter::for('login', function ($request) {
            $key = $request->input('email') . '|' . $request->ip();
            [$max, $min] = explode(',', (string) env('THROTTLE_LOGIN', '5,1'));
            return Limit::perMinutes((int) $min, (int) $max)->by($key);
        });
    }
}

<?php

use App\Http\Middleware\AccionPermitida;
use App\Http\Middleware\ModuloPermitido;
use App\Http\Middleware\RoleMiddleware;
use App\Http\Middleware\VerificarMantenimiento;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->alias([
            'role' => RoleMiddleware::class,
            'modulo' => ModuloPermitido::class,
            'accion' => AccionPermitida::class,
            'mantenimiento' => VerificarMantenimiento::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        // Respuestas JSON para la API
        $exceptions->shouldRenderJsonWhen(fn ($request) => $request->is('api/*'));
    })->create();

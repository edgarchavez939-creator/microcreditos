<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\AreaController;
use App\Http\Controllers\Api\ClienteController;
use App\Http\Controllers\Api\PagoController;
use App\Http\Controllers\Api\ReamortizacionController;
use App\Http\Controllers\Api\SolicitudController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\UsuarioController;
use App\Http\Controllers\Api\ReporteController;
use App\Http\Controllers\Api\TransferenciaController;
use App\Http\Controllers\Api\ParametroController;
use App\Http\Controllers\Api\MapaController;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['status' => 'ok', 'version' => 'v22-mapa', 'ts' => now()]));

// --- Auth (público con rate limiting) ---
Route::prefix('auth')->group(function () {
    Route::post('login', [AuthController::class, 'login'])->middleware('throttle:login');
    Route::post('refresh', [AuthController::class, 'refresh'])->middleware('throttle:30,1');
});

// --- Rutas protegidas ---
Route::middleware('auth:api')->group(function () {
    Route::get('auth/me', [AuthController::class, 'me']);

    // Áreas y Clientes
    Route::get('dashboard', [DashboardController::class, 'index']);
    Route::get('reportes/cartera', [ReporteController::class, 'cartera']);
    Route::get('reportes/pagos', [ReporteController::class, 'pagos']);
    Route::get('reportes/mora', [ReporteController::class, 'mora']);
    Route::get('transferencias', [TransferenciaController::class, 'index']);
    Route::get('transferencias/{transferencia}/comprobante', [TransferenciaController::class, 'comprobante']);
    Route::post('transferencias/{transferencia}/aprobar', [TransferenciaController::class, 'aprobar']);
    Route::post('transferencias/{transferencia}/rechazar', [TransferenciaController::class, 'rechazar']);
    Route::get('parametros', [ParametroController::class, 'index']);
    Route::patch('parametros', [ParametroController::class, 'update']);
    Route::get('mapa/clientes', [MapaController::class, 'clientes']);
    Route::apiResource('usuarios', UsuarioController::class)->only(['index', 'store', 'update']);
    Route::get('areas', [AreaController::class, 'index']);
    Route::post('areas', [AreaController::class, 'store']);
    Route::patch('areas/{area}', [AreaController::class, 'update']);
    Route::get('cobradores', [AreaController::class, 'cobradores']);
    Route::apiResource('clientes', ClienteController::class)->only(['index', 'store', 'show', 'update']);
    Route::patch('clientes/{cliente}/contacto', [ClienteController::class, 'actualizarContacto']);
    Route::get('clientes/{cliente}/historial', [ClienteController::class, 'historial']);
    Route::delete('solicitudes/{solicitud}', [SolicitudController::class, 'destroy']);
    Route::post('auth/logout', [AuthController::class, 'logout']);

    // Solicitudes de préstamo / ventas financiadas
    Route::apiResource('solicitudes', SolicitudController::class)
        ->only(['index','store','show']);
    Route::post('solicitudes/{solicitud}/aprobar', [SolicitudController::class, 'aprobar']);
    Route::post('solicitudes/{solicitud}/rechazar', [SolicitudController::class, 'rechazar']);
    Route::post('solicitudes/{solicitud}/cronograma', [SolicitudController::class, 'generarCronograma']);
    Route::get('solicitudes/{solicitud}/eventos', [SolicitudController::class, 'eventos']);

    // Desembolso y pagos (ciclo del dinero)
    Route::post('solicitudes/{solicitud}/desembolsar', [SolicitudController::class, 'desembolsar']);
    Route::post('pagos', [PagoController::class, 'store']);

    // --- Amortización / Reamortización / Refinanciación ---
    Route::get('solicitudes/{solicitud}/saldo', [ReamortizacionController::class, 'saldo']);
    Route::post('solicitudes/{solicitud}/reamortizar', [ReamortizacionController::class, 'reamortizar']);
    Route::get('solicitudes/{solicitud}/historial', [ReamortizacionController::class, 'historial']);
    Route::get('clientes/{cliente}/cupo', [ReamortizacionController::class, 'verCupo']);
    Route::put('clientes/{cliente}/cupo', [ReamortizacionController::class, 'setCupo']);

    // (Se extienden de igual forma: clientes, pagos, transferencias, caja,
    //  mora, reportes, dashboard, areas, usuarios, parametros, documentos.)
});

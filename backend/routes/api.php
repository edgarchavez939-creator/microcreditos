<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\AreaController;
use App\Http\Controllers\Api\ClienteController;
use App\Http\Controllers\Api\PagoController;
use App\Http\Controllers\Api\ReamortizacionController;
use App\Http\Controllers\Api\SolicitudController;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['status' => 'ok', 'version' => 'v10-borrado-contacto', 'ts' => now()]));

// --- Auth (público con rate limiting) ---
Route::prefix('auth')->group(function () {
    Route::post('login', [AuthController::class, 'login'])->middleware('throttle:login');
    Route::post('refresh', [AuthController::class, 'refresh'])->middleware('throttle:30,1');
});

// --- Rutas protegidas ---
Route::middleware('auth:api')->group(function () {
    Route::get('auth/me', [AuthController::class, 'me']);

    // Áreas y Clientes
    Route::get('areas', [AreaController::class, 'index']);
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

<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\AreaController;
use App\Http\Controllers\Api\ClienteController;
use App\Http\Controllers\Api\DocumentoController;
use App\Http\Controllers\Api\PagoController;
use App\Http\Controllers\Api\ReamortizacionController;
use App\Http\Controllers\Api\SolicitudController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\UsuarioController;
use App\Http\Controllers\Api\ReporteController;
use App\Http\Controllers\Api\TransferenciaController;
use App\Http\Controllers\Api\ParametroController;
use App\Http\Controllers\Api\MapaController;
use App\Http\Controllers\Api\CajaController;
use App\Http\Controllers\Api\OtpController;
use App\Http\Controllers\Api\PermisoController;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['status' => 'ok', 'version' => 'v60-robustez-demo', 'ts' => now()]));

// Extracto PDF: accesible por enlace firmado (para compartir por WhatsApp) o con JWT
Route::get('solicitudes/{solicitud}/extracto.pdf', [SolicitudController::class, 'extractoPdf'])
    ->name('extracto.pdf')->middleware('signed');

// --- Auth (público con rate limiting) ---
Route::prefix('auth')->group(function () {
    Route::post('login', [AuthController::class, 'login'])->middleware('throttle:login');
    Route::post('refresh', [AuthController::class, 'refresh'])->middleware('throttle:30,1');
});

// --- Rutas protegidas ---
Route::middleware(['auth:api', 'mantenimiento'])->group(function () {
    Route::get('auth/me', [AuthController::class, 'me']);

    // Áreas y Clientes
    Route::get('dashboard', [DashboardController::class, 'index'])->middleware('modulo:inicio');
    Route::get('dashboard/graficas', [DashboardController::class, 'graficas'])->middleware('modulo:inicio');
    Route::get('reportes/cartera', [ReporteController::class, 'cartera'])->middleware('modulo:reportes');
    Route::get('reportes/pagos', [ReporteController::class, 'pagos'])->middleware('modulo:reportes');

    // ===== Administrador Funcional (acceso exclusivo, validado en el controlador) =====
    Route::prefix('admin-funcional')->group(function () {
        Route::get('licencia', [\App\Http\Controllers\Api\AdminFuncionalController::class, 'verLicencia']);
        Route::put('licencia', [\App\Http\Controllers\Api\AdminFuncionalController::class, 'guardarLicencia']);
        Route::get('flags', [\App\Http\Controllers\Api\AdminFuncionalController::class, 'listarFlags']);
        Route::put('flags', [\App\Http\Controllers\Api\AdminFuncionalController::class, 'guardarFlag']);
        Route::get('marca', [\App\Http\Controllers\Api\AdminFuncionalController::class, 'verMarca']);
        Route::put('marca', [\App\Http\Controllers\Api\AdminFuncionalController::class, 'guardarMarca']);
        Route::post('cache/limpiar', [\App\Http\Controllers\Api\AdminFuncionalController::class, 'limpiarCache']);
        Route::get('monitoreo', [\App\Http\Controllers\Api\AdminFuncionalController::class, 'monitoreo']);
        Route::get('mantenimiento', [\App\Http\Controllers\Api\AdminFuncionalController::class, 'verMantenimiento']);
        Route::put('mantenimiento', [\App\Http\Controllers\Api\AdminFuncionalController::class, 'guardarMantenimiento']);
        Route::get('versiones', [\App\Http\Controllers\Api\AdminFuncionalController::class, 'listarVersiones']);
        Route::post('versiones', [\App\Http\Controllers\Api\AdminFuncionalController::class, 'guardarVersion']);
        Route::get('auditoria', [\App\Http\Controllers\Api\AdminFuncionalController::class, 'auditoriaGlobal']);
        Route::get('parametros', [\App\Http\Controllers\Api\AdminFuncionalController::class, 'listarParametros']);
        Route::put('parametros', [\App\Http\Controllers\Api\AdminFuncionalController::class, 'guardarParametro']);
    });
    Route::get('reportes/mora', [ReporteController::class, 'mora'])->middleware('modulo:reportes');
    Route::get('transferencias', [TransferenciaController::class, 'index'])->middleware('modulo:transferencias');
    Route::get('transferencias/{transferencia}/comprobante', [TransferenciaController::class, 'comprobante']);
    Route::post('transferencias/{transferencia}/aprobar', [TransferenciaController::class, 'aprobar'])->middleware('modulo:transferencias');
    Route::post('transferencias/{transferencia}/rechazar', [TransferenciaController::class, 'rechazar'])->middleware('modulo:transferencias');
    Route::get('parametros', [ParametroController::class, 'index']);
    Route::patch('parametros', [ParametroController::class, 'update']);
    Route::get('mapa/clientes', [MapaController::class, 'clientes'])->middleware('modulo:mapa');
    Route::get('ruta-dia', [CajaController::class, 'rutaDia'])->middleware('modulo:ruta');
    Route::get('caja/resumen-dia', [CajaController::class, 'resumenDia'])->middleware('modulo:caja');
    Route::post('caja/base', [CajaController::class, 'registrarBase'])->middleware('modulo:caja');
    Route::post('caja/gasto', [CajaController::class, 'registrarGasto'])->middleware('modulo:caja');
    Route::delete('caja/gasto/{id}', [CajaController::class, 'eliminarGasto'])->middleware('modulo:caja');
    Route::post('caja/cerrar', [CajaController::class, 'cerrar'])->middleware('modulo:caja');
    Route::get('caja/cierres', [CajaController::class, 'cierres'])->middleware('modulo:caja');
    Route::get('reportes/caja', [ReporteController::class, 'caja'])->middleware('modulo:reportes');
    Route::get('reportes/productividad', [ReporteController::class, 'productividad'])->middleware('modulo:reportes');
    Route::delete('pagos/{pago}', [PagoController::class, 'destroy']);
    Route::post('otp/generar', [OtpController::class, 'generar']);
    Route::get('mis-permisos', [PermisoController::class, 'mios']);
    Route::get('permisos', [PermisoController::class, 'index']);
    Route::patch('permisos', [PermisoController::class, 'update']);
    Route::get('clientes-buscar', [ClienteController::class, 'porDocumento']);
    // Administración de documentos del cliente
    Route::get('clientes/{cliente}/documentos', [DocumentoController::class, 'index']);
    Route::post('clientes/{cliente}/documentos', [DocumentoController::class, 'store']);
    Route::get('clientes/{cliente}/documentos/{documento}', [DocumentoController::class, 'show']);
    Route::post('clientes/{cliente}/documentos/{documento}/reemplazar', [DocumentoController::class, 'replace']);
    Route::delete('clientes/{cliente}/documentos/{documento}', [DocumentoController::class, 'destroy']);
    Route::get('reamortizacion/buscar', [ReamortizacionController::class, 'porNumero']);
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
        ->only(['index','store','show'])
        ->parameters(['solicitudes' => 'solicitud']); // fija el nombre del parámetro (evita la singularización inglesa 'solicitude')
    Route::post('solicitudes/{solicitud}/aprobar', [SolicitudController::class, 'aprobar']);
    Route::post('solicitudes/{solicitud}/rechazar', [SolicitudController::class, 'rechazar']);
    Route::post('solicitudes/{solicitud}/cronograma', [SolicitudController::class, 'generarCronograma']);
    Route::get('solicitudes/{solicitud}/eventos', [SolicitudController::class, 'eventos']);
    Route::get('solicitudes/{solicitud}/cuotas', [SolicitudController::class, 'cuotas']);
    Route::get('solicitudes/{solicitud}/extracto-enlace', [SolicitudController::class, 'extractoEnlace']);

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

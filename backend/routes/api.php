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

Route::get('/health', fn () => response()->json(['status' => 'ok', 'version' => 'v116-alta-admin', 'ts' => now()]));

// IDENTIDAD PÚBLICA (sin auth): es la de la PLATAFORMA, no la de una empresa.
// En la pantalla de acceso todavía no se sabe quién entra, así que se muestra la
// marca KRYPTA; la identidad de la empresa se aplica al iniciar sesión (/mi-marca). Incluye colores, tipografías y los logos, para que la pantalla
// de entrada ya se vea con la marca del cliente.
// Se cachea 5 minutos: la piden todos los usuarios en cada arranque.
Route::get('/marca-publica', function () {
    $data = \Illuminate\Support\Facades\Cache::remember('marca:publica', 300, function () {
        $def = [
            'nombre_plataforma' => 'KRYPTA', 'descriptor' => 'Business Suite',
            'color_primario' => '#1A2B5F', 'color_secundario' => '#2563EB',
            'color_exito' => '#10B981', 'color_advertencia' => '#F59E0B',
            'color_peligro' => '#EF4444', 'color_oscuro' => '#0F172A',
            'color_fondo' => '#F8FAFC',
            'tipografia_titulos' => 'Sora', 'tipografia_texto' => 'Inter',
            'radio' => 'redondeado',
        ];
        $marca = [];
        foreach ($def as $k => $v) {
            $marca[$k] = \App\Models\Parametro::valor("marca.{$k}", $v);
        }
        // Compatibilidad con la clave antigua de nombre
        $marca['nombre'] = $marca['nombre_plataforma'];

        $marca['logos'] = \Illuminate\Support\Facades\DB::table('marca_activos')
            ->get(['variante', 'mime', 'contenido_base64'])
            ->mapWithKeys(fn ($a) => [$a->variante => "data:{$a->mime};base64,{$a->contenido_base64}"])
            ->all();

        return $marca;
    });

    return response()->json(['data' => $data]);
});

// Extracto PDF: accesible por enlace firmado (para compartir por WhatsApp) o con JWT
Route::get('solicitudes/{solicitud}/extracto.pdf', [SolicitudController::class, 'extractoPdf'])
    ->name('extracto.pdf')->middleware('signed');

// --- Auth (público con rate limiting) ---
Route::prefix('auth')->group(function () {
    Route::post('login', [AuthController::class, 'login'])->middleware('throttle:login');
    Route::post('login/google', [AuthController::class, 'loginGoogle'])->middleware('throttle:login');
    Route::post('refresh', [AuthController::class, 'refresh'])->middleware('throttle:30,1');
});

// --- Rutas protegidas ---
Route::middleware(['auth:api', 'empresa', 'mantenimiento'])->group(function () {
    Route::get('auth/me', [AuthController::class, 'me']);

    // Áreas y Clientes
    Route::get('dashboard', [DashboardController::class, 'index'])->middleware('modulo:inicio');
    Route::get('dashboard/graficas', [DashboardController::class, 'graficas'])->middleware('modulo:inicio');
    Route::get('dashboard/gerencial', [DashboardController::class, 'gerencial'])->middleware('modulo:inicio');
    Route::get('reportes/cartera', [ReporteController::class, 'cartera'])->middleware('modulo:reportes');

    // ===== Gestión de mora / cobranza =====
    Route::prefix('mora')->group(function () {
        Route::get('cartera', [\App\Http\Controllers\Api\MoraController::class, 'cartera'])->middleware('modulo:mora');
        Route::get('promesas', [\App\Http\Controllers\Api\MoraController::class, 'promesas'])->middleware('modulo:mora');
        Route::get('historial/{cliente}', [\App\Http\Controllers\Api\MoraController::class, 'historial'])->middleware('modulo:mora');
        Route::post('gestion', [\App\Http\Controllers\Api\MoraController::class, 'registrar'])->middleware(['modulo:mora', 'accion:mora.gestionar']);
    });

    // ===== Caja General (exclusivo administrador; validado en el controlador) =====
    Route::prefix('caja-general')->group(function () {
        Route::get('estado', [\App\Http\Controllers\Api\CajaGeneralController::class, 'estado']);
        Route::get('pendientes', [\App\Http\Controllers\Api\CajaGeneralController::class, 'pendientes']);
        Route::post('recibir/{cierre}', [\App\Http\Controllers\Api\CajaGeneralController::class, 'recibir'])->middleware('accion:caja-general.recibir');
        Route::post('cerrar', [\App\Http\Controllers\Api\CajaGeneralController::class, 'cerrarGeneral'])->middleware('accion:caja-general.cerrar');
        Route::get('historial', [\App\Http\Controllers\Api\CajaGeneralController::class, 'historial']);
    });
    Route::get('reportes/pagos', [ReporteController::class, 'pagos'])->middleware('modulo:reportes');

    // ===== Administrador Funcional (acceso exclusivo, validado en el controlador) =====
    Route::prefix('admin-funcional')->group(function () {
        Route::get('licencia', [\App\Http\Controllers\Api\AdminFuncionalController::class, 'verLicencia']);
        Route::put('licencia', [\App\Http\Controllers\Api\AdminFuncionalController::class, 'guardarLicencia']);
        Route::get('flags', [\App\Http\Controllers\Api\AdminFuncionalController::class, 'listarFlags']);
        Route::put('flags', [\App\Http\Controllers\Api\AdminFuncionalController::class, 'guardarFlag']);
        Route::get('marca', [\App\Http\Controllers\Api\AdminFuncionalController::class, 'verMarca']);
        Route::put('marca', [\App\Http\Controllers\Api\AdminFuncionalController::class, 'guardarMarca']);
        Route::post('marca/restaurar', [\App\Http\Controllers\Api\AdminFuncionalController::class, 'restaurarMarca']);
        Route::post('marca/logo', [\App\Http\Controllers\Api\AdminFuncionalController::class, 'guardarLogo']);
        Route::delete('marca/logo/{variante}', [\App\Http\Controllers\Api\AdminFuncionalController::class, 'eliminarLogo']);
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
    Route::post('transferencias/{transferencia}/aprobar', [TransferenciaController::class, 'aprobar'])->middleware(['modulo:transferencias', 'accion:transferencias.validar']);
    Route::post('transferencias/{transferencia}/rechazar', [TransferenciaController::class, 'rechazar'])->middleware(['modulo:transferencias', 'accion:transferencias.validar']);
    Route::get('parametros', [ParametroController::class, 'index']);
    Route::patch('parametros', [ParametroController::class, 'update'])->middleware('accion:parametros.editar');
    Route::get('mapa/clientes', [MapaController::class, 'clientes'])->middleware('modulo:mapa');
    Route::post('mapa/ubicacion', [MapaController::class, 'reportarUbicacion']);
    Route::get('mapa/cobradores-en-vivo', [MapaController::class, 'cobradoresEnVivo'])->middleware('modulo:mapa');
    Route::get('ruta-dia', [CajaController::class, 'rutaDia'])->middleware('modulo:ruta');
    Route::get('caja/resumen-dia', [CajaController::class, 'resumenDia'])->middleware('modulo:caja');
    Route::post('caja/abrir', [CajaController::class, 'abrirCaja'])->middleware('modulo:caja');
    Route::post('caja/reposicion', [CajaController::class, 'registrarReposicion'])->middleware('modulo:caja');
    Route::post('caja/gasto', [CajaController::class, 'registrarGasto'])->middleware('modulo:caja');
    Route::delete('caja/gasto/{id}', [CajaController::class, 'eliminarGasto'])->middleware('modulo:caja');
    Route::post('caja/cerrar', [CajaController::class, 'cerrar'])->middleware(['modulo:caja', 'accion:caja.cerrar']);
    Route::get('caja/cierres', [CajaController::class, 'cierres'])->middleware('modulo:caja');
    Route::get('reportes/caja', [ReporteController::class, 'caja'])->middleware('modulo:reportes');
    Route::get('reportes/cierres-caja', [ReporteController::class, 'cierresCaja'])->middleware('modulo:reportes');
    Route::get('reportes/migrados', [ReporteController::class, 'migrados'])->middleware('modulo:reportes');

    // Identidad visual de la empresa del usuario. Se sirve ya con el contexto
    // activo, así que el aislamiento devuelve la marca correcta sin filtrar nada.
    Route::post('auth/password', [AuthController::class, 'cambiarPassword']);

    Route::get('mi-marca', function (\Illuminate\Http\Request $request) {
        $def = [
            'nombre_plataforma' => 'KRYPTA', 'descriptor' => 'Business Suite',
            'color_primario' => '#1A2B5F', 'color_secundario' => '#2563EB',
            'color_exito' => '#10B981', 'color_advertencia' => '#F59E0B',
            'color_peligro' => '#EF4444', 'color_oscuro' => '#0F172A',
            'color_fondo' => '#F8FAFC',
            'tipografia_titulos' => 'Sora', 'tipografia_texto' => 'Inter',
            'radio' => 'redondeado',
        ];

        $marca = [];
        foreach ($def as $k => $v) {
            $marca[$k] = \App\Models\Parametro::valor("marca.{$k}", $v);
        }
        $marca['nombre'] = $marca['nombre_plataforma'];

        $marca['logos'] = \Illuminate\Support\Facades\DB::table('marca_activos')
            ->get(['variante', 'mime', 'contenido_base64'])
            ->mapWithKeys(fn ($a) => [$a->variante => "data:{$a->mime};base64,{$a->contenido_base64}"])
            ->all();

        // Datos de la empresa que la interfaz necesita para formatear valores
        $empresa = $request->user()->empresa_id
            ? \Illuminate\Support\Facades\DB::table('empresas')
                ->where('id', $request->user()->empresa_id)
                ->first(['id', 'nombre', 'moneda', 'simbolo_moneda', 'zona_horaria', 'formato_fecha', 'estado'])
            : null;

        return response()->json(['data' => $marca + ['empresa' => $empresa]]);
    });

    // --- PLATAFORMA · exclusivo del Administrador Funcional Global ---
    // Estas rutas gobiernan el SaaS: empresas, módulos y planes. No tocan datos
    // de negocio de ninguna empresa.
    Route::prefix('plataforma')->group(function () {
        Route::get('empresas', [\App\Http\Controllers\Api\EmpresaController::class, 'index']);
        Route::post('empresas', [\App\Http\Controllers\Api\EmpresaController::class, 'store']);
        Route::put('empresas/{empresa}', [\App\Http\Controllers\Api\EmpresaController::class, 'update']);
        Route::post('empresas/{empresa}/estado', [\App\Http\Controllers\Api\EmpresaController::class, 'cambiarEstado']);
        Route::get('empresas/{empresa}/modulos', [\App\Http\Controllers\Api\EmpresaController::class, 'modulos']);
        Route::post('empresas/{empresa}/modulos', [\App\Http\Controllers\Api\EmpresaController::class, 'fijarModulo']);
        Route::put('empresas/{empresa}/plan', [\App\Http\Controllers\Api\EmpresaController::class, 'guardarPlan']);

        // Modo Soporte y monitoreo
        Route::post('empresas/{empresa}/soporte', [\App\Http\Controllers\Api\PlataformaController::class, 'entrarSoporte']);
        Route::post('soporte/salir', [\App\Http\Controllers\Api\PlataformaController::class, 'salirSoporte']);
        Route::get('soporte/historial', [\App\Http\Controllers\Api\PlataformaController::class, 'historialSoporte']);
        Route::get('monitoreo', [\App\Http\Controllers\Api\PlataformaController::class, 'monitoreo']);
    });

    // --- MIGRACIÓN DE CARTERA (módulo exclusivo de administración) ---
    Route::prefix('migraciones')->middleware('modulo:migracion')->group(function () {
        Route::get('opciones', [\App\Http\Controllers\Api\MigracionController::class, 'opciones']);
        Route::post('plantillas', [\App\Http\Controllers\Api\MigracionController::class, 'guardarPlantilla']);
        Route::post('simular', [\App\Http\Controllers\Api\MigracionController::class, 'simular']);
        Route::post('{migracion}/importar', [\App\Http\Controllers\Api\MigracionController::class, 'importar']);
        Route::get('{migracion}/registros', [\App\Http\Controllers\Api\MigracionController::class, 'registros']);
        Route::get('/', [\App\Http\Controllers\Api\MigracionController::class, 'index']);
    });

    // --- CENTRO DE VALIDACIÓN DE MIGRACIONES (Fase 2) ---
    Route::prefix('validacion-migrados')->middleware('modulo:migracion')->group(function () {
        Route::get('/', [\App\Http\Controllers\Api\ValidacionMigracionController::class, 'index']);
        Route::get('opciones', [\App\Http\Controllers\Api\ValidacionMigracionController::class, 'opciones']);
        Route::get('indicadores', [\App\Http\Controllers\Api\ValidacionMigracionController::class, 'indicadores']);
        Route::post('{id}/validar', [\App\Http\Controllers\Api\ValidacionMigracionController::class, 'validar'])->middleware('accion:migrados.validar');
        Route::patch('{id}', [\App\Http\Controllers\Api\ValidacionMigracionController::class, 'editar'])->middleware('accion:migrados.editar');
    });
    Route::get('reportes/productividad', [ReporteController::class, 'productividad'])->middleware('modulo:reportes');
    Route::delete('pagos/{pago}', [PagoController::class, 'destroy'])->middleware('accion:pagos.anular');
    Route::post('otp/generar', [OtpController::class, 'generar']);
    Route::get('mis-permisos', [PermisoController::class, 'mios']);
    Route::get('permisos', [PermisoController::class, 'index']);
    Route::patch('permisos', [PermisoController::class, 'update']);
    Route::get('clientes-buscar', [ClienteController::class, 'porDocumento']);
    Route::get('busqueda-global', [\App\Http\Controllers\Api\BusquedaController::class, 'global']);
    // Administración de documentos del cliente
    Route::get('clientes/{cliente}/documentos', [DocumentoController::class, 'index']);
    Route::post('clientes/{cliente}/documentos', [DocumentoController::class, 'store'])->middleware('accion:documentos.subir');
    Route::get('clientes/{cliente}/documentos/{documento}', [DocumentoController::class, 'show']);
    Route::post('clientes/{cliente}/documentos/{documento}/reemplazar', [DocumentoController::class, 'replace']);
    Route::delete('clientes/{cliente}/documentos/{documento}', [DocumentoController::class, 'destroy'])->middleware('accion:documentos.eliminar');
    Route::get('reamortizacion/buscar', [ReamortizacionController::class, 'porNumero']);
    Route::apiResource('usuarios', UsuarioController::class)->only(['index', 'store', 'update'])
        ->middleware('accion:usuarios.gestionar');
    Route::get('areas', [AreaController::class, 'index']);
    Route::post('areas', [AreaController::class, 'store']);
    Route::patch('areas/{area}', [AreaController::class, 'update']);
    Route::get('cobradores', [AreaController::class, 'cobradores']);
    Route::apiResource('clientes', ClienteController::class)->only(['index', 'store', 'show', 'update']);
    Route::patch('clientes/{cliente}/contacto', [ClienteController::class, 'actualizarContacto']);
    Route::get('clientes/{cliente}/historial', [ClienteController::class, 'historial']);
    Route::get('clientes/{cliente}/panorama', [ClienteController::class, 'panorama360']);
    Route::get('clientes/{cliente}/historial-creditos', [ClienteController::class, 'historialCreditos']);
    Route::delete('solicitudes/{solicitud}', [SolicitudController::class, 'destroy'])->middleware('accion:solicitudes.eliminar');
    Route::post('auth/logout', [AuthController::class, 'logout']);

    // Solicitudes de préstamo / ventas financiadas
    Route::apiResource('solicitudes', SolicitudController::class)
        ->only(['index','store','show'])
        ->parameters(['solicitudes' => 'solicitud']); // fija el nombre del parámetro (evita la singularización inglesa 'solicitude')
    Route::post('solicitudes/{solicitud}/aprobar', [SolicitudController::class, 'aprobar'])->middleware('accion:solicitudes.aprobar');
    Route::post('solicitudes/{solicitud}/rechazar', [SolicitudController::class, 'rechazar'])->middleware('accion:solicitudes.rechazar');
    Route::post('solicitudes/{solicitud}/cronograma', [SolicitudController::class, 'generarCronograma']);
    // ===== Estado de Cuenta del Empleado =====
    // ===== Motor de Productos Financieros =====
    Route::get('productos-financieros/activos', [\App\Http\Controllers\Api\ProductoFinancieroController::class, 'activos']);
    Route::get('productos-financieros', [\App\Http\Controllers\Api\ProductoFinancieroController::class, 'index']);
    Route::post('productos-financieros', [\App\Http\Controllers\Api\ProductoFinancieroController::class, 'store']);
    Route::patch('productos-financieros/{producto}', [\App\Http\Controllers\Api\ProductoFinancieroController::class, 'update']);
    Route::post('productos-financieros/{producto}/activar', [\App\Http\Controllers\Api\ProductoFinancieroController::class, 'activar']);
    Route::post('productos-financieros/{producto}/duplicar', [\App\Http\Controllers\Api\ProductoFinancieroController::class, 'duplicar']);
    Route::get('productos-financieros/{producto}/versiones', [\App\Http\Controllers\Api\ProductoFinancieroController::class, 'versiones']);

    Route::prefix('empleados')->group(function () {
        Route::get('estado-cuenta', [\App\Http\Controllers\Api\EstadoCuentaEmpleadoController::class, 'consolidado']);
        Route::get('{empleado}/estado-cuenta', [\App\Http\Controllers\Api\EstadoCuentaEmpleadoController::class, 'show']);
        Route::post('{empleado}/prestamos', [\App\Http\Controllers\Api\EstadoCuentaEmpleadoController::class, 'crearPrestamo']);
        Route::post('{empleado}/consolidar-descuadres', [\App\Http\Controllers\Api\EstadoCuentaEmpleadoController::class, 'consolidarDescuadres']);
        Route::post('{empleado}/obligaciones/{obligacion}/abonar', [\App\Http\Controllers\Api\EstadoCuentaEmpleadoController::class, 'abonar']);
    });

    Route::get('solicitudes/{solicitud}/eventos', [SolicitudController::class, 'eventos']);
    Route::get('solicitudes/{solicitud}/evaluar-renovacion', [SolicitudController::class, 'evaluarRenovacion']);

    // Tareas pendientes por módulo (badges del menú); calculado del estado real
    Route::get('tareas/badges', function (\Illuminate\Http\Request $request, \App\Services\TareaService $tareas) {
        return response()->json(['data' => $tareas->badges($request->user())]);
    });

    // Inbox de Trabajo: detalles de las tareas pendientes del usuario
    Route::get('tareas/inbox', function (\Illuminate\Http\Request $request, \App\Services\TareaService $tareas) {
        return response()->json(['data' => $tareas->inbox($request->user())]);
    });
    Route::get('solicitudes/{solicitud}/cuotas', [SolicitudController::class, 'cuotas']);
    Route::get('solicitudes/{solicitud}/extracto-enlace', [SolicitudController::class, 'extractoEnlace']);

    // Desembolso y pagos (ciclo del dinero)
    Route::post('solicitudes/{solicitud}/desembolsar', [SolicitudController::class, 'desembolsar'])->middleware('accion:creditos.desembolsar');
    Route::post('solicitudes/{solicitud}/anular-desembolso', [SolicitudController::class, 'anularDesembolso'])->middleware('accion:creditos.desembolsar');
    Route::post('pagos', [PagoController::class, 'store'])->middleware('accion:pagos.registrar');

    // --- Amortización / Reamortización / Refinanciación ---
    Route::get('solicitudes/{solicitud}/saldo', [ReamortizacionController::class, 'saldo']);
    Route::post('solicitudes/{solicitud}/reamortizar', [ReamortizacionController::class, 'reamortizar'])->middleware('accion:creditos.reamortizar');
    Route::get('solicitudes/{solicitud}/historial', [ReamortizacionController::class, 'historial']);
    Route::get('clientes/{cliente}/cupo', [ReamortizacionController::class, 'verCupo']);
    Route::put('clientes/{cliente}/cupo', [ReamortizacionController::class, 'setCupo']);

    // (Se extienden de igual forma: clientes, pagos, transferencias, caja,
    //  mora, reportes, dashboard, areas, usuarios, parametros, documentos.)
});

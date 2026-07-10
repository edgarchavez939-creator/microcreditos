<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

/**
 * Centro de administración técnica. Acceso EXCLUSIVO del Administrador Funcional.
 * Cada acción queda auditada. Separado del administrador operativo.
 */
class AdminFuncionalController extends Controller
{
    private function soloFuncional(Request $request): void
    {
        abort_unless($request->user()?->esAdminFuncional(), 403, 'Acceso exclusivo del Administrador Funcional.');
    }

    private function auditar(Request $request, string $accion, $anterior, $nuevo): void
    {
        DB::table('auditoria')->insert([
            'usuario_id'   => $request->user()->id,
            'accion'       => 'FUNC_' . $accion,
            'entidad'      => 'admin_funcional',
            'entidad_id'   => null,
            'datos_nuevos' => json_encode(['anterior' => $anterior, 'nuevo' => $nuevo], JSON_UNESCAPED_UNICODE),
            'ip'           => $request->ip(),
            'user_agent'   => $request->userAgent(),
            'created_at'   => now(),
        ]);
    }

    // ===================== LICENCIAMIENTO =====================

    public function verLicencia(Request $request)
    {
        $this->soloFuncional($request);
        $lic = DB::table('licencia')->where('id', 1)->first();

        // Conteo actual de usuarios por rol (para mostrar uso vs. límite)
        $conteo = DB::table('usuarios')->where('activo', true)
            ->selectRaw("rol, COUNT(*) as n")->groupBy('rol')->pluck('n', 'rol');

        return response()->json(['data' => [
            'licencia' => $lic,
            'uso' => [
                'total'          => (int) DB::table('usuarios')->where('activo', true)->where('rol', '!=', 'ADMIN_FUNCIONAL')->count(),
                'administradores'=> (int) ($conteo['ADMINISTRADOR'] ?? 0),
                'supervisores'   => (int) ($conteo['SUPERVISOR'] ?? 0),
                'cobradores'     => (int) ($conteo['COBRADOR'] ?? 0),
            ],
        ]]);
    }

    public function guardarLicencia(Request $request)
    {
        $this->soloFuncional($request);
        $data = $request->validate([
            'max_usuarios'        => ['required', 'integer', 'min:1'],
            'max_administradores' => ['required', 'integer', 'min:1'],
            'max_supervisores'    => ['required', 'integer', 'min:0'],
            'max_cobradores'      => ['required', 'integer', 'min:0'],
            'vence_el'            => ['nullable', 'date'],
            'estado'              => ['required', 'in:ACTIVA,SUSPENDIDA,VENCIDA'],
        ]);

        $anterior = DB::table('licencia')->where('id', 1)->first();
        DB::table('licencia')->where('id', 1)->update(array_merge($data, [
            'actualizado_por' => $request->user()->id, 'updated_at' => now(),
        ]));
        $this->auditar($request, 'LICENCIA', $anterior, $data);

        return response()->json(['message' => 'Licencia actualizada.']);
    }

    // ===================== FEATURE FLAGS =====================

    public function listarFlags(Request $request)
    {
        $this->soloFuncional($request);
        return response()->json(['data' => DB::table('feature_flags')->orderBy('etiqueta')->get()]);
    }

    public function guardarFlag(Request $request)
    {
        $this->soloFuncional($request);
        $data = $request->validate([
            'clave'      => ['required', 'string', 'max:80'],
            'etiqueta'   => ['required', 'string', 'max:160'],
            'descripcion'=> ['nullable', 'string'],
            'activo'     => ['required', 'boolean'],
            'en_pruebas' => ['required', 'boolean'],
        ]);

        $anterior = DB::table('feature_flags')->where('clave', $data['clave'])->first();
        DB::table('feature_flags')->updateOrInsert(
            ['clave' => $data['clave']],
            array_merge($data, ['actualizado_por' => $request->user()->id, 'updated_at' => now()]),
        );
        $this->auditar($request, 'FLAG', $anterior, $data);

        return response()->json(['message' => 'Funcionalidad actualizada.']);
    }

    // ===================== PERSONALIZACIÓN / MARCA =====================

    public function verMarca(Request $request)
    {
        $this->soloFuncional($request);
        return response()->json(['data' => [
            'nombre_plataforma' => \App\Models\Parametro::valor('marca.nombre', 'Microcréditos'),
            'color_primario'    => \App\Models\Parametro::valor('marca.color', '#4F46E5'),
            'contacto'          => \App\Models\Parametro::valor('marca.contacto', ''),
        ]]);
    }

    public function guardarMarca(Request $request)
    {
        $this->soloFuncional($request);
        $data = $request->validate([
            'nombre_plataforma' => ['required', 'string', 'max:80'],
            'color_primario'    => ['required', 'string', 'max:9'],
            'contacto'          => ['nullable', 'string', 'max:200'],
        ]);
        $anterior = $this->verMarca($request)->getData(true)['data'];
        \App\Models\Parametro::setValor('marca.nombre', $data['nombre_plataforma']);
        \App\Models\Parametro::setValor('marca.color', $data['color_primario']);
        \App\Models\Parametro::setValor('marca.contacto', $data['contacto'] ?? '');
        $this->auditar($request, 'MARCA', $anterior, $data);

        return response()->json(['message' => 'Marca actualizada.']);
    }

    // ===================== HERRAMIENTAS TÉCNICAS =====================

    public function limpiarCache(Request $request)
    {
        $this->soloFuncional($request);
        Artisan::call('cache:clear');
        Artisan::call('config:clear');
        $this->auditar($request, 'CACHE_CLEAR', null, ['resultado' => 'ok']);
        return response()->json(['message' => 'Caché limpiada.']);
    }

    // ===================== MONITOREO (estado real, sin simular) =====================

    public function monitoreo(Request $request)
    {
        $this->soloFuncional($request);

        // Estado de la base de datos: prueba real de conexión
        $dbOk = false; $dbMs = null;
        try {
            $t0 = microtime(true);
            DB::select('SELECT 1');
            $dbMs = round((microtime(true) - $t0) * 1000, 1);
            $dbOk = true;
        } catch (\Throwable $e) { $dbOk = false; }

        // Usuarios activos en las últimas 24h (por último acceso, si se registra)
        $activos24h = (int) DB::table('usuarios')->where('activo', true)
            ->where('rol', '!=', 'ADMIN_FUNCIONAL')->count();

        $lic = DB::table('licencia')->where('id', 1)->first();

        return response()->json(['data' => [
            'base_datos'  => ['ok' => $dbOk, 'latencia_ms' => $dbMs],
            'usuarios'    => ['total' => $activos24h],
            'licencia'    => ['estado' => $lic->estado ?? 'ACTIVA', 'vence_el' => $lic->vence_el ?? null],
            'version'     => \App\Models\Parametro::valor('app.version', 'v56'),
            // Integraciones externas: se reportan como "no configurado" hasta que existan
            // sus credenciales. No se inventan estados falsos.
            'whatsapp'    => ['configurado' => false],
            'google_maps' => ['configurado' => false],
            'respaldos'   => ['configurado' => false],
        ]]);
    }

    // ===================== MODO MANTENIMIENTO =====================

    public function verMantenimiento(Request $request)
    {
        $this->soloFuncional($request);
        return response()->json(['data' => DB::table('mantenimiento')->where('id', 1)->first()]);
    }

    public function guardarMantenimiento(Request $request)
    {
        $this->soloFuncional($request);
        $data = $request->validate([
            'activo'  => ['required', 'boolean'],
            'mensaje' => ['nullable', 'string', 'max:500'],
        ]);

        $anterior = DB::table('mantenimiento')->where('id', 1)->first();
        DB::table('mantenimiento')->where('id', 1)->update([
            'activo'       => $data['activo'],
            'mensaje'      => $data['mensaje'] ?? null,
            'inicio'       => $data['activo'] ? ($anterior->inicio ?? now()) : $anterior->inicio,
            'fin'          => $data['activo'] ? null : now(),
            'activado_por' => $request->user()->id,
            'updated_at'   => now(),
        ]);
        $this->auditar($request, 'MANTENIMIENTO', $anterior, $data);
        \Illuminate\Support\Facades\Cache::forget('mantenimiento:estado');

        return response()->json(['message' => $data['activo'] ? 'Modo mantenimiento activado.' : 'Modo mantenimiento desactivado.']);
    }

    // ===================== ADMINISTRACIÓN DE VERSIONES =====================

    public function listarVersiones(Request $request)
    {
        $this->soloFuncional($request);
        return response()->json(['data' => DB::table('versiones as v')
            ->leftJoin('usuarios as u', 'u.id', '=', 'v.registrado_por')
            ->orderByDesc('v.fecha_liberacion')->orderByDesc('v.id')
            ->get(['v.*', 'u.nombre as registrado_por_nombre'])]);
    }

    public function guardarVersion(Request $request)
    {
        $this->soloFuncional($request);
        $data = $request->validate([
            'version'          => ['required', 'string', 'max:40'],
            'fecha_liberacion' => ['nullable', 'date'],
            'mejoras'          => ['nullable', 'string'],
            'estado'           => ['required', 'in:PRODUCCION,PRUEBAS,DEPRECADA'],
        ]);
        DB::table('versiones')->insert(array_merge($data, [
            'fecha_liberacion' => $data['fecha_liberacion'] ?? now()->toDateString(),
            'registrado_por'   => $request->user()->id,
            'created_at'       => now(),
        ]));
        $this->auditar($request, 'VERSION', null, $data);
        return response()->json(['message' => 'Versión registrada.'], 201);
    }

    // ===================== AUDITORÍA GLOBAL =====================

    public function auditoriaGlobal(Request $request)
    {
        $this->soloFuncional($request);

        $q = DB::table('auditoria as a')
            ->leftJoin('usuarios as u', 'u.id', '=', 'a.usuario_id');

        if ($request->filled('entidad'))  $q->where('a.entidad', $request->query('entidad'));
        if ($request->filled('accion'))   $q->where('a.accion', 'like', $request->query('accion') . '%');
        if ($request->filled('usuario_id')) $q->where('a.usuario_id', (int) $request->query('usuario_id'));
        if ($request->filled('desde'))    $q->whereDate('a.created_at', '>=', $request->query('desde'));
        if ($request->filled('hasta'))    $q->whereDate('a.created_at', '<=', $request->query('hasta'));

        $filas = $q->orderByDesc('a.created_at')->limit(200)->get([
            'a.id', 'a.accion', 'a.entidad', 'a.entidad_id', 'a.datos_nuevos',
            'a.ip', 'a.created_at', 'u.nombre as usuario', 'u.rol as rol',
        ]);

        return response()->json(['data' => $filas]);
    }

    // ===================== GESTIÓN DE PARÁMETROS =====================

    public function listarParametros(Request $request)
    {
        $this->soloFuncional($request);
        return response()->json(['data' => DB::table('parametros')->orderBy('clave')->get(['clave', 'valor', 'descripcion', 'updated_at'])]);
    }

    public function guardarParametro(Request $request)
    {
        $this->soloFuncional($request);
        $data = $request->validate([
            'clave' => ['required', 'string', 'max:120'],
            'valor' => ['required'],
        ]);
        $anterior = \App\Models\Parametro::valor($data['clave']);
        \App\Models\Parametro::setValor($data['clave'], $data['valor']);
        $this->auditar($request, 'PARAMETRO', ['clave' => $data['clave'], 'valor' => $anterior], $data);
        return response()->json(['message' => 'Parámetro actualizado.']);
    }
}

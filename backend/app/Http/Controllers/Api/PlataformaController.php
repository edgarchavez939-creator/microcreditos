<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * PLATAFORMA · Modo Soporte y Centro de Monitoreo Global.
 *
 * MODO SOPORTE: el Administrador Global puede entrar temporalmente a una empresa
 * para diagnosticar un problema. Toda la sesión queda registrada —quién, cuándo,
 * por qué, desde dónde y qué hizo—, porque un acceso técnico sin rastro es
 * indistinguible de una intrusión. Es la diferencia entre soporte y espionaje.
 */
class PlataformaController extends Controller
{
    private function soloGlobal(Request $request): void
    {
        abort_unless($request->user()?->esAdminGlobal(), 403,
            'Esta sección pertenece a la administración de la plataforma KRYPTA.');
    }

    // ─────────────────────────────── Modo Soporte

    public function entrarSoporte(Request $request, int $empresa)
    {
        $this->soloGlobal($request);
        $data = $request->validate([
            'motivo' => ['required', 'string', 'min:10', 'max:255'],
        ]);

        $u = $request->user();

        $emp = DB::table('empresas')->where('id', $empresa)->first(['id', 'nombre']);
        abort_if(! $emp, 404, 'La empresa no existe.');

        // Cerrar cualquier sesión de soporte que quedara abierta
        $this->cerrarSesionesAbiertas($u->id);

        $sesionId = DB::table('sesiones_soporte')->insertGetId([
            'empresa_id'        => $empresa,
            'usuario_global_id' => $u->id,
            'motivo'            => $data['motivo'],
            'iniciada_at'       => now(),
            'ip'                => $request->ip(),
            'user_agent'        => substr((string) $request->userAgent(), 0, 255),
        ]);

        DB::table('usuarios')->where('id', $u->id)->update(['empresa_soporte_id' => $empresa]);

        DB::table('auditoria')->insert([
            'empresa_id' => $empresa, 'usuario_id' => $u->id,
            'accion' => 'SOPORTE_INICIADO', 'entidad' => 'empresa', 'entidad_id' => $empresa,
            'datos_nuevos' => json_encode(['motivo' => $data['motivo'], 'sesion' => $sesionId], JSON_UNESCAPED_UNICODE),
            'ip' => $request->ip(), 'sesion_soporte_id' => $sesionId, 'created_at' => now(),
        ]);

        return response()->json([
            'message' => "Modo soporte activo en «{$emp->nombre}». Todas tus acciones quedarán registradas.",
            'data' => ['empresa_id' => $empresa, 'empresa' => $emp->nombre, 'sesion_id' => $sesionId],
        ]);
    }

    public function salirSoporte(Request $request)
    {
        $this->soloGlobal($request);
        $u = $request->user();

        $this->cerrarSesionesAbiertas($u->id);
        DB::table('usuarios')->where('id', $u->id)->update(['empresa_soporte_id' => null]);

        return response()->json(['message' => 'Modo soporte finalizado.']);
    }

    private function cerrarSesionesAbiertas(int $usuarioId): void
    {
        $abiertas = DB::table('sesiones_soporte')
            ->where('usuario_global_id', $usuarioId)->whereNull('finalizada_at')->get();

        foreach ($abiertas as $s) {
            $minutos = (int) round((now()->timestamp - \Illuminate\Support\Carbon::parse($s->iniciada_at)->timestamp) / 60);
            $acciones = DB::table('auditoria')->where('sesion_soporte_id', $s->id)->count();

            DB::table('sesiones_soporte')->where('id', $s->id)->update([
                'finalizada_at' => now(), 'minutos' => $minutos, 'acciones' => $acciones,
            ]);

            DB::table('auditoria')->insert([
                'empresa_id' => $s->empresa_id, 'usuario_id' => $usuarioId,
                'accion' => 'SOPORTE_FINALIZADO', 'entidad' => 'empresa', 'entidad_id' => $s->empresa_id,
                'datos_nuevos' => json_encode(['minutos' => $minutos, 'acciones' => $acciones], JSON_UNESCAPED_UNICODE),
                'sesion_soporte_id' => $s->id, 'created_at' => now(),
            ]);
        }
    }

    /** Historial de accesos de soporte (rendición de cuentas ante el cliente). */
    public function historialSoporte(Request $request)
    {
        $this->soloGlobal($request);

        $filas = DB::table('sesiones_soporte as s')
            ->join('empresas as e', 'e.id', '=', 's.empresa_id')
            ->join('usuarios as u', 'u.id', '=', 's.usuario_global_id')
            ->orderByDesc('s.iniciada_at')->limit(100)
            ->get(['s.id', 'e.nombre as empresa', 'u.nombre as tecnico', 's.motivo',
                   's.iniciada_at', 's.finalizada_at', 's.minutos', 's.acciones', 's.ip']);

        return response()->json(['data' => $filas]);
    }

    // ─────────────────────────────── Centro de Monitoreo Global

    public function monitoreo(Request $request)
    {
        $this->soloGlobal($request);

        $empresas = DB::table('empresas')
            ->selectRaw("estado, COUNT(*) as n")->groupBy('estado')->pluck('n', 'estado');

        $hoy = now()->toDateString();

        // Estas consultas cruzan todas las empresas a propósito: son las cifras
        // agregadas de la plataforma, no de la cartera de ningún cliente.
        $pagosHoy = DB::table('pagos')->whereDate('created_at', $hoy)
            ->selectRaw('COUNT(*) as n, COALESCE(SUM(valor),0) as total')->first();

        $creditos = DB::table('solicitudes')
            ->whereIn('estado', ['ACTIVO', 'DESEMBOLSADO', 'EN_MORA', 'MIGRADO'])->count();

        $usuarios = DB::table('usuarios')->where('activo', true)->whereNotNull('empresa_id')->count();

        // Licencias que vencen dentro de 30 días
        $porVencer = DB::table('empresa_planes as p')
            ->join('empresas as e', 'e.id', '=', 'p.empresa_id')
            ->whereNotNull('p.fecha_vencimiento')
            ->whereBetween('p.fecha_vencimiento', [$hoy, now()->addDays(30)->toDateString()])
            ->orderBy('p.fecha_vencimiento')
            ->get(['e.id', 'e.nombre', 'p.plan', 'p.fecha_vencimiento', 'p.estado']);

        // Estado de la base de datos y del aislamiento
        $rol = DB::selectOne("SELECT current_user AS usuario, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user");
        $tablasProtegidas = DB::selectOne("
            SELECT COUNT(*) AS n FROM pg_tables t
            JOIN pg_class c ON c.relname = t.tablename
            WHERE t.schemaname = 'public' AND c.relrowsecurity = true
        ")?->n;

        $soporteActivo = DB::table('sesiones_soporte')->whereNull('finalizada_at')->count();

        return response()->json(['data' => [
            'empresas' => [
                'activas'     => (int) ($empresas['ACTIVA'] ?? 0),
                'prueba'      => (int) ($empresas['PRUEBA'] ?? 0),
                'suspendidas' => (int) ($empresas['SUSPENDIDA'] ?? 0),
                'inactivas'   => (int) ($empresas['INACTIVA'] ?? 0),
            ],
            'usuarios_activos'  => $usuarios,
            'creditos_vigentes' => $creditos,
            'pagos_hoy'         => ['cantidad' => (int) $pagosHoy->n, 'total' => (float) $pagosHoy->total],
            'licencias_por_vencer' => $porVencer,
            'soporte_activo'    => $soporteActivo,
            'salud' => [
                'base_datos'          => 'OK',
                'tablas_protegidas'   => (int) $tablasProtegidas,
                'rol_conexion'        => $rol?->usuario,
                // Si esto sale en true, el aislamiento entre empresas NO funciona.
                'aislamiento_en_riesgo' => (bool) (($rol?->rolsuper ?? false) || ($rol?->rolbypassrls ?? false)),
                'version'             => config('app.version', 'v113'),
            ],
        ]]);
    }
}

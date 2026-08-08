<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * MÓDULO EMPRESAS · exclusivo del Administrador Funcional Global.
 *
 * Aquí se da de alta cada empresa cliente, se configuran sus módulos, sus
 * funcionalidades y su plan. Ninguna operación de este controlador toca datos
 * de negocio: gobierna la plataforma, no la cartera de nadie.
 */
class EmpresaController extends Controller
{
    private function soloGlobal(Request $request): void
    {
        abort_unless($request->user()?->esAdminGlobal(), 403,
            'Solo el Administrador Funcional Global administra las empresas de la plataforma.');
    }

    /** Listado con su estado, plan y cifras de uso. */
    public function index(Request $request)
    {
        $this->soloGlobal($request);

        $empresas = DB::table('empresas as e')
            ->leftJoin('empresa_planes as p', 'p.empresa_id', '=', 'e.id')
            ->orderBy('e.nombre')
            ->get([
                'e.id', 'e.nombre', 'e.nit', 'e.estado', 'e.moneda', 'e.zona_horaria',
                'e.ciudad', 'e.telefono', 'e.email', 'e.created_at', 'e.suspendida_at',
                'p.plan', 'p.estado as estado_plan', 'p.fecha_vencimiento', 'p.max_usuarios',
            ]);

        // Cifras de uso por empresa. Se consultan sin el filtro de empresa
        // porque este rol opera por encima del aislamiento, por definición.
        $usuarios = DB::table('usuarios')->whereNotNull('empresa_id')
            ->selectRaw('empresa_id, COUNT(*) as n')->groupBy('empresa_id')->pluck('n', 'empresa_id');
        $clientes = DB::table('clientes')
            ->selectRaw('empresa_id, COUNT(*) as n')->groupBy('empresa_id')->pluck('n', 'empresa_id');
        $creditos = DB::table('solicitudes')->whereIn('estado', ['ACTIVO', 'DESEMBOLSADO', 'EN_MORA', 'MIGRADO'])
            ->selectRaw('empresa_id, COUNT(*) as n')->groupBy('empresa_id')->pluck('n', 'empresa_id');
        $modulos = DB::table('empresa_modulos')->where('habilitado', true)
            ->selectRaw('empresa_id, COUNT(*) as n')->groupBy('empresa_id')->pluck('n', 'empresa_id');

        $data = $empresas->map(fn ($e) => (array) $e + [
            'usuarios' => (int) ($usuarios[$e->id] ?? 0),
            'clientes' => (int) ($clientes[$e->id] ?? 0),
            'creditos_activos' => (int) ($creditos[$e->id] ?? 0),
            'modulos_habilitados' => (int) ($modulos[$e->id] ?? 0),
        ]);

        return response()->json(['data' => $data]);
    }

    public function store(Request $request)
    {
        $this->soloGlobal($request);
        $data = $this->validar($request);

        $id = DB::transaction(function () use ($data, $request) {
            $id = DB::table('empresas')->insertGetId($data + [
                'estado' => 'PRUEBA',
                'creada_por' => $request->user()->id,
                'created_at' => now(), 'updated_at' => now(),
            ]);

            // Toda empresa nueva arranca con los módulos de núcleo habilitados:
            // sin ellos no podría ni entrar a configurarse.
            $nucleo = DB::table('catalogo_modulos')->where('nucleo', true)->pluck('codigo');
            foreach ($nucleo as $codigo) {
                DB::table('empresa_modulos')->insert([
                    'empresa_id' => $id, 'modulo_codigo' => $codigo, 'habilitado' => true,
                    'habilitado_at' => now(), 'habilitado_por' => $request->user()->id,
                    'updated_at' => now(),
                ]);
            }

            DB::table('empresa_planes')->insert([
                'empresa_id' => $id, 'plan' => 'BASICO', 'estado' => 'PRUEBA',
                'fecha_inicio' => now()->toDateString(),
                'fecha_vencimiento' => now()->addDays(30)->toDateString(),
                'max_usuarios' => 5, 'updated_at' => now(),
            ]);

            return $id;
        });

        $this->auditar($request, 'EMPRESA_CREADA', $id, $data);

        return response()->json([
            'message' => 'Empresa creada en modo prueba por 30 días. Habilita sus módulos y crea su primer administrador.',
            'data' => ['id' => $id],
        ], 201);
    }

    public function update(Request $request, int $empresa)
    {
        $this->soloGlobal($request);
        $data = $this->validar($request, $empresa);

        $antes = (array) DB::table('empresas')->where('id', $empresa)->first();
        DB::table('empresas')->where('id', $empresa)->update($data + ['updated_at' => now()]);

        $this->auditar($request, 'EMPRESA_ACTUALIZADA', $empresa, ['antes' => $antes, 'despues' => $data]);
        Cache::forget("empresa:{$empresa}:modulos");

        return response()->json(['message' => 'Empresa actualizada.']);
    }

    /** Suspender, reactivar o dar de baja. */
    public function cambiarEstado(Request $request, int $empresa)
    {
        $this->soloGlobal($request);
        $data = $request->validate([
            'estado' => ['required', Rule::in(['ACTIVA', 'SUSPENDIDA', 'PRUEBA', 'INACTIVA'])],
            'motivo' => ['nullable', 'string', 'max:255'],
        ]);

        $antes = DB::table('empresas')->where('id', $empresa)->value('estado');

        DB::table('empresas')->where('id', $empresa)->update([
            'estado' => $data['estado'],
            'suspendida_at' => $data['estado'] === 'SUSPENDIDA' ? now() : null,
            'motivo_suspension' => $data['estado'] === 'SUSPENDIDA' ? ($data['motivo'] ?? null) : null,
            'updated_at' => now(),
        ]);

        $this->auditar($request, 'EMPRESA_ESTADO', $empresa, ['antes' => $antes, 'despues' => $data['estado'], 'motivo' => $data['motivo'] ?? null]);

        $msg = match ($data['estado']) {
            'SUSPENDIDA' => 'Empresa suspendida: sus usuarios no podrán entrar hasta reactivarla.',
            'ACTIVA'     => 'Empresa reactivada.',
            'INACTIVA'   => 'Empresa dada de baja. Sus datos se conservan.',
            default      => 'Empresa en modo prueba.',
        };

        return response()->json(['message' => $msg]);
    }

    /** Catálogo global + módulos habilitados de una empresa. */
    public function modulos(Request $request, int $empresa)
    {
        $this->soloGlobal($request);

        $catalogo = DB::table('catalogo_modulos')->where('estado', '!=', 'RETIRADO')
            ->orderBy('categoria')->orderBy('orden')->get();
        $habilitados = DB::table('empresa_modulos')->where('empresa_id', $empresa)
            ->pluck('habilitado', 'modulo_codigo');

        return response()->json(['data' => [
            'catalogo' => $catalogo->map(fn ($m) => (array) $m + [
                'habilitado' => (bool) ($habilitados[$m->codigo] ?? false),
            ]),
        ]]);
    }

    /** Habilita o deshabilita un módulo para una empresa. */
    public function fijarModulo(Request $request, int $empresa)
    {
        $this->soloGlobal($request);
        $data = $request->validate([
            'modulo_codigo' => ['required', 'string', 'exists:catalogo_modulos,codigo'],
            'habilitado'    => ['required', 'boolean'],
        ]);

        $modulo = DB::table('catalogo_modulos')->where('codigo', $data['modulo_codigo'])->first();

        // Los módulos de núcleo no se apagan: sin ellos la empresa no puede operar
        // ni siquiera para configurarse.
        if ($modulo?->nucleo && ! $data['habilitado']) {
            return response()->json([
                'message' => "«{$modulo->nombre}» es un módulo básico y no puede deshabilitarse.",
            ], 422);
        }

        // Dependencias: no tiene sentido habilitar algo cuyo requisito está apagado.
        if ($data['habilitado'] && $modulo) {
            $deps = json_decode($modulo->dependencias ?? '[]', true) ?: [];
            foreach ($deps as $dep) {
                $activo = DB::table('empresa_modulos')
                    ->where('empresa_id', $empresa)->where('modulo_codigo', $dep)
                    ->value('habilitado');
                if (! $activo) {
                    $nombreDep = DB::table('catalogo_modulos')->where('codigo', $dep)->value('nombre') ?? $dep;
                    return response()->json([
                        'message' => "Primero habilita «{$nombreDep}»: este módulo lo necesita.",
                    ], 422);
                }
            }
        }

        DB::table('empresa_modulos')->updateOrInsert(
            ['empresa_id' => $empresa, 'modulo_codigo' => $data['modulo_codigo']],
            [
                'habilitado' => $data['habilitado'],
                'habilitado_at' => $data['habilitado'] ? now() : null,
                'habilitado_por' => $request->user()->id,
                'updated_at' => now(),
            ]
        );

        Cache::forget("empresa:{$empresa}:modulos");
        $this->auditar($request, 'EMPRESA_MODULO', $empresa, $data);

        return response()->json(['message' => $data['habilitado'] ? 'Módulo habilitado.' : 'Módulo deshabilitado.']);
    }

    /** Plan y límites. */
    public function guardarPlan(Request $request, int $empresa)
    {
        $this->soloGlobal($request);
        $data = $request->validate([
            'plan'   => ['required', Rule::in(['BASICO', 'PROFESIONAL', 'ENTERPRISE'])],
            'estado' => ['required', Rule::in(['ACTIVO', 'VENCIDO', 'PRUEBA'])],
            'fecha_inicio' => ['nullable', 'date'],
            'fecha_vencimiento' => ['nullable', 'date', 'after_or_equal:fecha_inicio'],
            'max_usuarios' => ['nullable', 'integer', 'min:1'],
            'max_sucursales' => ['nullable', 'integer', 'min:1'],
        ]);

        DB::table('empresa_planes')->updateOrInsert(
            ['empresa_id' => $empresa],
            $data + ['updated_at' => now()]
        );

        $this->auditar($request, 'EMPRESA_PLAN', $empresa, $data);

        return response()->json(['message' => 'Plan actualizado.']);
    }

    private function validar(Request $request, ?int $id = null): array
    {
        return $request->validate([
            'nombre'        => ['required', 'string', 'max:160'],
            'razon_social'  => ['nullable', 'string', 'max:200'],
            'nit'           => ['nullable', 'string', 'max:40'],
            'moneda'        => ['nullable', 'string', 'max:8'],
            'simbolo_moneda'=> ['nullable', 'string', 'max:6'],
            'zona_horaria'  => ['nullable', 'string', 'max:60'],
            'idioma'        => ['nullable', 'string', 'max:8'],
            'formato_fecha' => ['nullable', 'string', 'max:20'],
            'direccion'     => ['nullable', 'string', 'max:200'],
            'ciudad'        => ['nullable', 'string', 'max:100'],
            'telefono'      => ['nullable', 'string', 'max:40'],
            'email'         => ['nullable', 'email', 'max:160'],
            'sitio_web'     => ['nullable', 'string', 'max:160'],
        ]);
    }

    private function auditar(Request $request, string $accion, int $empresaId, array $datos): void
    {
        DB::table('auditoria')->insert([
            'empresa_id'   => $empresaId,
            'usuario_id'   => $request->user()->id,
            'accion'       => $accion,
            'entidad'      => 'empresa',
            'entidad_id'   => $empresaId,
            'datos_nuevos' => json_encode($datos, JSON_UNESCAPED_UNICODE),
            'ip'           => $request->ip(),
            'user_agent'   => substr((string) $request->userAgent(), 0, 255),
            'created_at'   => now(),
        ]);
    }
}

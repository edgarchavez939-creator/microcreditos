<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\MigracionService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * MIGRACIÓN DE CARTERA — acceso exclusivo del perfil administrador
 * (y del Admin Funcional, que supervisa la parametrización del sistema).
 */
class MigracionController extends Controller
{
    public function __construct(private MigracionService $svc) {}

    private function soloAdmin(Request $request): void
    {
        $u = $request->user();
        abort_unless($u && ($u->esAdministrador() || $u->esAdminFuncional()), 403,
            'La migración de cartera es exclusiva del administrador.');
    }

    /** Catálogo de campos mapeables + plantillas guardadas + catálogos de apoyo. */
    public function opciones(Request $request)
    {
        $this->soloAdmin($request);
        return response()->json(['data' => [
            'campos'     => MigracionService::CAMPOS,
            'plantillas' => DB::table('migracion_plantillas')->orderBy('nombre')->get(['id', 'nombre', 'mapeo']),
            'areas'      => DB::table('areas')->orderBy('nombre')->get(['id', 'nombre']),
            'cobradores' => DB::table('usuarios')->where('activo', true)
                                ->whereIn('rol', ['COBRADOR', 'SUPERVISOR'])->orderBy('nombre')->get(['id', 'nombre']),
            'productos'  => DB::table('productos_financieros')->where('activo', true)->orderBy('orden')->get(['id', 'nombre']),
        ]]);
    }

    /** Guardar una plantilla de mapeo reutilizable. */
    public function guardarPlantilla(Request $request)
    {
        $this->soloAdmin($request);
        $data = $request->validate([
            'nombre' => ['required', 'string', 'max:100'],
            'mapeo'  => ['required', 'array'],
        ]);
        $id = DB::table('migracion_plantillas')->updateOrInsert(
            ['nombre' => $data['nombre']],
            ['mapeo' => json_encode($data['mapeo'], JSON_UNESCAPED_UNICODE),
             'creado_por' => $request->user()->id, 'created_at' => now()]
        );
        return response()->json(['message' => 'Plantilla guardada.'], 201);
    }

    /**
     * SIMULAR una importación. Recibe las filas ya normalizadas por el asistente
     * (el archivo se lee en el navegador; aquí solo llegan datos estructurados).
     */
    public function simular(Request $request)
    {
        $this->soloAdmin($request);
        $data = $request->validate([
            'filas'               => ['required', 'array', 'min:1', 'max:5000'],
            'nombre_archivo'      => ['required', 'string', 'max:255'],
            'plantilla_id'        => ['nullable', 'integer', 'exists:migracion_plantillas,id'],
            'area_defecto_id'     => ['nullable', 'integer', 'exists:areas,id'],
            'cobrador_defecto_id' => ['nullable', 'integer', 'exists:usuarios,id'],
            'producto_defecto_id' => ['nullable', 'integer', 'exists:productos_financieros,id'],
        ]);

        $resumen = $this->svc->simular($data['filas'], $data, $request->user());
        return response()->json(['message' => 'Simulación completada. Revisa el resultado antes de importar.', 'data' => $resumen], 201);
    }

    /** IMPORTAR un lote simulado (confirmación explícita; transaccional). */
    public function importar(Request $request, int $migracion)
    {
        $this->soloAdmin($request);
        try {
            $resultado = $this->svc->importar($migracion, $request->user());
        } catch (\DomainException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
        return response()->json([
            'message' => "Importación completada: {$resultado['clientes']} cliente(s) nuevo(s), {$resultado['creditos']} crédito(s) migrado(s).",
            'data'    => $resultado,
        ]);
    }

    /** Historial de lotes. */
    public function index(Request $request)
    {
        $this->soloAdmin($request);
        $lotes = DB::table('migraciones as m')
            ->leftJoin('usuarios as u', 'u.id', '=', 'm.importado_por')
            ->orderByDesc('m.created_at')->limit(50)
            ->get(['m.*', 'u.nombre as usuario']);
        return response()->json(['data' => $lotes]);
    }

    /** Detalle de un lote: registros con su resultado (para revisar y exportar). */
    public function registros(Request $request, int $migracion)
    {
        $this->soloAdmin($request);
        $filtro = $request->query('resultado'); // VALIDO | ADVERTENCIA | ERROR | null
        $regs = DB::table('migracion_registros')
            ->where('migracion_id', $migracion)
            ->when($filtro, fn ($q) => $q->where('resultado', $filtro))
            ->orderBy('fila')
            ->get(['fila', 'datos', 'resultado', 'mensajes', 'accion_cliente', 'accion_credito']);
        return response()->json(['data' => $regs]);
    }
}

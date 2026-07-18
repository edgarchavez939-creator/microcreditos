<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ProductoFinancieroService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Productos Financieros.
 * - Gestión (CRUD, activar, duplicar, versiones): exclusiva del ADMIN FUNCIONAL.
 * - Listado de productos activos: disponible para los roles operativos (el formulario
 *   de solicitud lo usa para construirse dinámicamente).
 */
class ProductoFinancieroController extends Controller
{
    public function __construct(private ProductoFinancieroService $svc) {}

    private function soloFuncional(Request $request): void
    {
        abort_unless($request->user()?->esAdminFuncional(), 403, 'Gestión exclusiva del Administrador Funcional.');
    }

    /** Productos ACTIVOS para el formulario de solicitud (todos los roles). */
    public function activos()
    {
        $productos = DB::table('productos_financieros')
            ->where('activo', true)->orderBy('orden')->orderBy('nombre')->get();
        return response()->json(['data' => $productos]);
    }

    /** Listado completo para administración (funcional). */
    public function index(Request $request)
    {
        $this->soloFuncional($request);
        $productos = DB::table('productos_financieros')->orderBy('orden')->orderBy('nombre')->get();
        return response()->json(['data' => $productos]);
    }

    public function store(Request $request)
    {
        $this->soloFuncional($request);
        $data = $this->validarProducto($request, true);
        $id = $this->svc->crear($data, $request);
        return response()->json(['message' => 'Producto creado.', 'id' => $id], 201);
    }

    public function update(Request $request, int $producto)
    {
        $this->soloFuncional($request);
        $data = $this->validarProducto($request, false);
        $this->svc->editar($producto, $data, $request);
        return response()->json(['message' => 'Producto actualizado. Se generó una nueva versión.']);
    }

    public function activar(Request $request, int $producto)
    {
        $this->soloFuncional($request);
        $data = $request->validate(['activo' => ['required', 'boolean']]);
        $this->svc->activar($producto, (bool) $data['activo'], $request);
        return response()->json(['message' => $data['activo'] ? 'Producto activado.' : 'Producto desactivado.']);
    }

    public function duplicar(Request $request, int $producto)
    {
        $this->soloFuncional($request);
        $data = $request->validate([
            'codigo' => ['required', 'string', 'max:30', 'unique:productos_financieros,codigo'],
            'nombre' => ['required', 'string', 'max:100'],
        ]);
        $id = $this->svc->duplicar($producto, strtoupper($data['codigo']), $data['nombre'], $request);
        return response()->json(['message' => 'Producto duplicado (queda inactivo para su revisión).', 'id' => $id], 201);
    }

    /** Historial de versiones del producto. */
    public function versiones(Request $request, int $producto)
    {
        $this->soloFuncional($request);
        $versiones = DB::table('producto_versiones as v')
            ->leftJoin('usuarios as u', 'u.id', '=', 'v.cambiado_por')
            ->where('v.producto_id', $producto)
            ->orderByDesc('v.version')
            ->get(['v.version', 'v.cambios', 'v.created_at', 'u.nombre as cambiado_por']);
        return response()->json(['data' => $versiones]);
    }

    private function validarProducto(Request $request, bool $creando): array
    {
        return $request->validate([
            'codigo' => [$creando ? 'required' : 'sometimes', 'string', 'max:30',
                $creando ? 'unique:productos_financieros,codigo' : 'nullable'],
            'nombre'      => [$creando ? 'required' : 'sometimes', 'string', 'max:100'],
            'descripcion' => ['nullable', 'string', 'max:1000'],
            'color'       => ['nullable', 'string', 'max:20'],
            'icono'       => ['nullable', 'string', 'max:40'],
            'orden'       => ['nullable', 'integer', 'min:0'],
            'usa_tasa'               => ['sometimes', 'boolean'],
            'tipo_tasa'              => ['sometimes', 'string', 'max:20'],
            'tasa_defecto'           => ['sometimes', 'numeric', 'gte:0'],
            'permite_modificar_tasa' => ['sometimes', 'boolean'],
            'usa_seguro'             => ['sometimes', 'boolean'],
            'seguro_defecto'         => ['sometimes', 'numeric', 'between:0,0.10'],
            'permite_modificar_seguro' => ['sometimes', 'boolean'],
            'usa_valor_pactado'      => ['sometimes', 'boolean'],
            'permite_pagos_libres'   => ['sometimes', 'boolean'],
            'permite_pagos_anticipados' => ['sometimes', 'boolean'],
            'permite_renovacion'     => ['sometimes', 'boolean'],
            'permite_refinanciacion' => ['sometimes', 'boolean'],
            'permite_reestructuracion' => ['sometimes', 'boolean'],
            'requiere_codeudor'      => ['sometimes', 'boolean'],
            'requiere_documentos'    => ['sometimes', 'boolean'],
            'capital_minimo'         => ['sometimes', 'numeric', 'gte:0'],
            'capital_maximo'         => ['sometimes', 'numeric', 'gte:0'],
            'cuotas_minimo'          => ['sometimes', 'integer', 'min:1'],
            'cuotas_maximo'          => ['sometimes', 'integer', 'min:1'],
            'frecuencias_permitidas' => ['sometimes', 'array', 'min:1'],
            'frecuencias_permitidas.*' => ['in:DIARIO,SEMANAL,QUINCENAL,MENSUAL'],
            'requiere_supervisor'    => ['sometimes', 'boolean'],
            'requiere_administrador' => ['sometimes', 'boolean'],
            'aprobacion_automatica'  => ['sometimes', 'boolean'],
            'permite_desembolso_efectivo'      => ['sometimes', 'boolean'],
            'permite_desembolso_transferencia' => ['sometimes', 'boolean'],
            'recauda_seguro'         => ['sometimes', 'boolean'],
            'maneja_caja'            => ['sometimes', 'boolean'],
            'config_extra'           => ['sometimes', 'array'],
        ]);
    }
}

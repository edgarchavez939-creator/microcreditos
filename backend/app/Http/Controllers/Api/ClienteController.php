<?php
namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreClienteRequest;
use App\Http\Resources\ClienteResource;
use App\Models\Cliente;
use App\Models\Referencia;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ClienteController extends Controller
{
    public function index(Request $request)
    {
        $this->authorize('viewAny', Cliente::class);
        $u = $request->user();

        $query = Cliente::query()->with(['area', 'cobrador'])->latest();

        // Modelo territorial: los CLIENTES pueden ser consultados por cualquier usuario
        // autorizado (para localizarlos). La restricción por área aplica solo a la
        // información FINANCIERA (créditos, pagos, cartera), no al directorio de clientes.

        if ($buscar = $request->query('buscar')) {
            $query->where(function ($q) use ($buscar) {
                $q->where('nombres', 'ilike', "%{$buscar}%")
                  ->orWhere('apellidos', 'ilike', "%{$buscar}%")
                  ->orWhere('numero_documento', 'ilike', "%{$buscar}%");
            });
        }

        return ClienteResource::collection($query->paginate(20));
    }

    public function store(StoreClienteRequest $request)
    {
        $this->authorize('create', Cliente::class);
        $u = $request->user();
        $data = $request->validated();

        // El cobrador solo puede asignarse a sí mismo; admin/supervisor pueden elegir.
        $cobradorId = $u->esCobrador() ? $u->id : ($data['cobrador_id'] ?? $u->id);

        $cliente = DB::transaction(function () use ($data, $u, $cobradorId) {
            $cliente = Cliente::create(array_merge(
                collect($data)->except(['referencias', 'documentos', 'cobrador_id'])->toArray(),
                ['cobrador_id' => $cobradorId, 'created_by' => $u->id, 'activo' => true]
            ));

            foreach ($data['referencias'] ?? [] as $ref) {
                if (! empty($ref['nombre'])) {
                    Referencia::create(array_merge($ref, ['cliente_id' => $cliente->id]));
                }
            }

            // Soportes opcionales (imágenes/PDF) guardados como base64
            foreach ($data['documentos'] ?? [] as $doc) {
                \App\Models\Documento::create([
                    'cliente_id'       => $cliente->id,
                    'categoria'        => 'OTRO',
                    's3_key'           => null,
                    'nombre_original'  => $doc['nombre'],
                    'mime'             => $doc['mime'],
                    'tamano_bytes'     => $doc['tamano'],
                    'contenido_base64' => $doc['contenido_base64'],
                    'subido_por'       => $u->id,
                ]);
            }
            return $cliente;
        });

        return (new ClienteResource($cliente->load(['area', 'cobrador', 'referencias'])))
            ->response()->setStatusCode(201);
    }

    public function show(Cliente $cliente)
    {
        $this->authorize('view', $cliente);
        return new ClienteResource($cliente->load(['area', 'cobrador', 'referencias', 'solicitudes']));
    }

    public function update(StoreClienteRequest $request, Cliente $cliente)
    {
        $this->authorize('update', $cliente);
        $data = $request->validated();

        $areaAnterior = $cliente->area_id;

        // El número (y tipo) de documento no son editables una vez creado el cliente.
        $cliente->update(collect($data)->except(['referencias', 'documentos', 'numero_documento', 'tipo_documento'])->toArray());

        // MODELO TERRITORIAL: el área es atributo EXCLUSIVO del cliente. Los créditos
        // NO almacenan el área para control de acceso; toda la información financiera la
        // obtiene en vivo del cliente (policies y filtros). Por eso, al cambiar de área,
        // NO se propaga nada a los créditos: la visibilidad se reasigna automáticamente.
        if ((int) $areaAnterior !== (int) $cliente->area_id) {
            \Illuminate\Support\Facades\DB::table('historial_area_cliente')->insert([
                'cliente_id'       => $cliente->id,
                'area_anterior_id' => $areaAnterior,
                'area_nueva_id'    => $cliente->area_id,
                'cambiado_por'     => $request->user()->id,
                'observaciones'    => $request->input('observacion_cambio_area'),
                'ip'               => $request->ip(),
                'user_agent'       => $request->userAgent(),
                'created_at'       => now(),
            ]);
        }

        return new ClienteResource($cliente->load(['area', 'cobrador', 'referencias']));
    }

    public function actualizarContacto(Request $request, Cliente $cliente)
    {
        $this->authorize('update', $cliente);
        $data = $request->validate([
            'correo'             => ['required', 'email', 'max:180'],
            'telefono_principal' => ['required', 'string', 'regex:/^[0-9]{7,10}$/'],
            'direccion'          => ['required', 'string', 'max:255'],
        ]);
        // El AuditObserver registra automáticamente quién y cuándo actualizó.
        $cliente->update($data);
        return new ClienteResource($cliente->load(['area', 'cobrador', 'referencias']));
    }

    public function historial(Cliente $cliente)
    {
        $this->authorize('view', $cliente);
        $filas = \Illuminate\Support\Facades\DB::table('auditoria')
            ->leftJoin('usuarios', 'auditoria.usuario_id', '=', 'usuarios.id')
            ->where('auditoria.entidad', 'Cliente')
            ->where('auditoria.entidad_id', $cliente->id)
            ->where('auditoria.accion', 'UPDATE')
            ->orderByDesc('auditoria.created_at')
            ->limit(50)
            ->get(['auditoria.created_at', 'auditoria.datos_nuevos', 'usuarios.nombre as usuario']);

        $historial = $filas->map(function ($f) {
            $cambios = json_decode($f->datos_nuevos ?? '{}', true) ?: [];
            unset($cambios['updated_at']);
            return [
                'fecha'   => $f->created_at,
                'usuario' => $f->usuario ?? 'Sistema',
                'campos'  => array_keys($cambios),
                'valores' => $cambios,
            ];
        })->filter(fn ($h) => count($h['campos']) > 0)->values();

        return response()->json(['data' => $historial]);
    }

    /**
     * HISTORIAL DE CRÉDITOS del cliente: todos sus créditos, de cualquier estado.
     * Separa cartera activa (lo operable) del historial crediticio (lo consultable).
     * Marca cuál es el último crédito PAGADO: el único elegible para renovación.
     */
    public function historialCreditos(Cliente $cliente, \App\Services\RenovacionService $renovaciones)
    {
        $this->authorize('view', $cliente);

        $creditos = \Illuminate\Support\Facades\DB::table('solicitudes as s')
            ->leftJoin('usuarios as uc', 'uc.id', '=', 's.created_by')
            ->leftJoin('usuarios as ua', 'ua.id', '=', 's.usuario_aprobador')
            ->leftJoin('desembolsos as d', 'd.solicitud_id', '=', 's.id')
            ->where('s.cliente_id', $cliente->id)
            ->orderByDesc('s.created_at')
            ->get([
                's.id', 's.numero_credito', 's.estado',
                's.created_at as fecha_solicitud',
                'd.fecha as fecha_desembolso',
                's.updated_at as fecha_actualizacion',
                's.capital_solicitado', 's.monto_aprobado', 's.plazo_meses',
                's.credito_origen_id', 's.tipo_origen',
                'uc.nombre as creado_por', 'ua.nombre as aprobado_por',
            ]);

        // Agregados por crédito: pagado, cuotas y mora acumulada (una sola consulta)
        $ids = $creditos->pluck('id');
        $agregados = \Illuminate\Support\Facades\DB::table('cuotas')
            ->whereIn('solicitud_id', $ids)
            ->groupBy('solicitud_id')
            ->selectRaw('solicitud_id,
                COUNT(*) as numero_cuotas,
                COALESCE(SUM(valor_pagado),0) as total_pagado,
                COALESCE(MAX(dias_mora),0) as max_dias_mora,
                MAX(CASE WHEN estado = \'PAGADA\' THEN updated_at END) as ultima_cuota_pagada')
            ->get()->keyBy('solicitud_id');

        // El crédito renovable: último PAGADO dentro de la ventana de renovación.
        // Si la ventana venció, ningún crédito muestra la opción (corresponde solicitud nueva).
        $renovable = $renovaciones->creditoRenovable($cliente->id);
        $ultimoPagadoId = $renovable['solicitud_id'] ?? null;

        // Mapa id → numero_credito para navegar la cadena de renovaciones
        $numeroPorId = $creditos->pluck('numero_credito', 'id');
        // Hijos: qué crédito renovó a cada uno (relación inversa)
        $renovadoPor = $creditos->whereNotNull('credito_origen_id')
            ->pluck('numero_credito', 'credito_origen_id');

        $filas = $creditos->map(function ($c) use ($agregados, $ultimoPagadoId, $numeroPorId, $renovadoPor) {
            $a = $agregados->get($c->id);
            return [
                'id'                => $c->id,
                'numero_credito'    => $c->numero_credito,
                'estado'            => $c->estado,
                'fecha_solicitud'   => $c->fecha_solicitud,
                'fecha_desembolso'  => $c->fecha_desembolso,
                'fecha_cancelacion' => $c->estado === 'PAGADO' ? ($a->ultima_cuota_pagada ?? $c->fecha_actualizacion) : null,
                'monto_aprobado'    => (float) ($c->monto_aprobado ?? 0),
                'capital_solicitado'=> (float) ($c->capital_solicitado ?? 0),
                'plazo_meses'       => (int) ($c->plazo_meses ?? 0),
                'total_pagado'      => (float) ($a->total_pagado ?? 0),
                'numero_cuotas'     => (int) ($a->numero_cuotas ?? 0),
                'max_dias_mora'     => (int) ($a->max_dias_mora ?? 0),
                'creado_por'        => $c->creado_por,
                'aprobado_por'      => $c->aprobado_por,
                'es_ultimo_pagado'  => $c->id === $ultimoPagadoId, // único renovable
                // Trazabilidad de renovación (cadena padre-hijo)
                'tipo_origen'          => $c->tipo_origen,
                'credito_origen_id'    => $c->credito_origen_id,
                'credito_origen_numero'=> $c->credito_origen_id ? ($numeroPorId[$c->credito_origen_id] ?? null) : null,
                'renovado_por_numero'  => $renovadoPor[$c->id] ?? null, // crédito hijo que lo renovó
            ];
        });

        return response()->json(['data' => $filas->values()]);
    }

    /**
     * Búsqueda GLOBAL por número de documento (validación previa a crear solicitud).
     * Evita duplicados: si el cliente ya existe (aunque sea de otro cobrador/área),
     * devuelve su información para continuar con la solicitud sobre él.
     */
    public function porDocumento(Request $request, \App\Services\RenovacionService $renovaciones)
    {
        $data = $request->validate(['documento' => ['required', 'string', 'regex:/^[0-9]+$/', 'max:40']]);

        $c = Cliente::with(['area:id,nombre', 'cobrador:id,nombre'])
            ->where('numero_documento', $data['documento'])
            ->first();

        if (! $c) {
            return response()->json(['data' => null, 'existe' => false]);
        }

        // Cliente antiguo: ¿tiene un crédito renovable? (último pagado dentro de la
        // ventana de renovación). Si la ventana venció, no se ofrece: solicitud nueva.
        $renovable = $renovaciones->creditoRenovable($c->id);

        return response()->json(['existe' => true, 'data' => [
            'id'                 => $c->id,
            'nombres'            => $c->nombres,
            'apellidos'          => $c->apellidos,
            'tipo_documento'     => $c->tipo_documento,
            'numero_documento'   => $c->numero_documento,
            'telefono_principal' => $c->telefono_principal,
            'direccion'          => $c->direccion,
            'area_id'            => $c->area_id,
            'area'               => $c->area?->nombre,
            'cobrador'           => $c->cobrador?->nombre,
            'activo'             => (bool) $c->activo,
            'credito_renovable'  => $renovable, // null si no aplica renovación
        ]]);
    }
}

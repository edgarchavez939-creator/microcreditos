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

        if ($u->esCobrador()) {
            $query->where(fn ($q) => $q->where('cobrador_id', $u->id)->orWhere('created_by', $u->id));
        } elseif ($u->esSupervisor()) {
            $areas = $u->areas()->pluck('areas.id');
            $query->where(fn ($q) => $q->whereIn('area_id', $areas)->orWhere('created_by', $u->id));
        }

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
        // El número (y tipo) de documento no son editables una vez creado el cliente.
        $cliente->update(collect($data)->except(['referencias', 'documentos', 'numero_documento', 'tipo_documento'])->toArray());

        // Si cambió el cobrador o el área, propagar a los créditos no finalizados del cliente
        // (así el nuevo cobrador puede ver y gestionar la cartera de inmediato).
        \App\Models\Solicitud::where('cliente_id', $cliente->id)
            ->whereNotIn('estado', ['FINALIZADO', 'RECHAZADO'])
            ->update([
                'cobrador_id' => $cliente->cobrador_id,
                'area_id'     => $cliente->area_id,
            ]);

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
}

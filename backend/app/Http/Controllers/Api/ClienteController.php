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
            $query->where('cobrador_id', $u->id);
        } elseif ($u->esSupervisor()) {
            $query->whereIn('area_id', $u->areas()->pluck('areas.id'));
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
        $cliente->update(collect($data)->except(['referencias', 'documentos', 'cobrador_id'])->toArray());
        return new ClienteResource($cliente->load(['area', 'cobrador', 'referencias']));
    }
}

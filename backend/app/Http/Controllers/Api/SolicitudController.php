<?php
namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreSolicitudRequest;
use App\Http\Resources\SolicitudResource;
use App\Jobs\GenerarCronogramaJob;
use App\Models\Solicitud;
use App\Services\ApprovalService;
use App\Services\LoanService;
use Illuminate\Http\Request;

class SolicitudController extends Controller
{
    public function __construct(
        private LoanService $loans,
        private ApprovalService $approvals,
    ) {}

    public function index(Request $request)
    {
        $this->authorize('viewAny', Solicitud::class);
        $query = Solicitud::query()->with(['cliente','area'])->latest();

        // Cobrador: solo sus solicitudes. Supervisor: sus áreas.
        $u = $request->user();
        if ($u->esCobrador()) {
            $query->where('cobrador_id', $u->id);
        } elseif ($u->esSupervisor()) {
            $query->whereIn('area_id', $u->areas()->pluck('areas.id'));
        }

        return SolicitudResource::collection($query->paginate(20));
    }

    public function store(StoreSolicitudRequest $request)
    {
        $this->authorize('create', Solicitud::class);
        $data = $request->validated();

        $solicitud = new Solicitud([
            'cliente_id'         => $data['cliente_id'],
            'area_id'            => $data['area_id'],
            'cobrador_id'        => $request->user()->id,
            'producto_id'        => $data['producto_id'] ?? null,
            'es_venta_financiada'=> $data['es_venta_financiada'] ?? false,
            'capital_solicitado' => $data['capital_solicitado'],
            'tipo_interes'       => $data['tipo_interes'] ?? 'FIJO',
            'numero_cuotas'      => $data['numero_cuotas'],
            'tasa_interes'       => $data['tasa_interes'],
            'modalidad'          => $data['modalidad'],
            'estado'             => 'BORRADOR',
            'created_by'         => $request->user()->id,
        ]);
        $solicitud->save();

        // Cálculo de seguro/montos + regla de exoneración
        $solicitud = $this->loans->calcularMontos($solicitud, $data, $request->user()->id);

        // Si no quedó en PENDIENTE_ADMINISTRADOR por exoneración, rutear normal
        if ($solicitud->estado === 'BORRADOR') {
            $solicitud->estado = $this->loans->rutearAprobacion($solicitud)->value;
            $solicitud->save();
        }

        return (new SolicitudResource($solicitud->fresh()))
            ->response()->setStatusCode(201);
    }

    public function show(Solicitud $solicitud)
    {
        $this->authorize('view', $solicitud);
        return new SolicitudResource($solicitud->load(['cliente','cuotas','pagos']));
    }

    public function aprobar(Solicitud $solicitud, Request $request)
    {
        $this->authorize('approve', $solicitud);
        $solicitud = $this->approvals->aprobar($solicitud, $request->user());
        return new SolicitudResource($solicitud);
    }

    public function rechazar(Solicitud $solicitud, Request $request)
    {
        $this->authorize('approve', $solicitud);
        $data = $request->validate(['motivo' => ['required','string','min:5']]);
        $solicitud = $this->approvals->rechazar($solicitud, $request->user(), $data['motivo']);
        return new SolicitudResource($solicitud);
    }

    public function generarCronograma(Solicitud $solicitud)
    {
        $this->authorize('update', $solicitud);
        GenerarCronogramaJob::dispatch($solicitud->id);
        return response()->json(['message' => 'Cronograma en generación.']);
    }
}

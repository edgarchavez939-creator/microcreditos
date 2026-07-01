<?php
namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreSolicitudRequest;
use App\Http\Resources\SolicitudResource;
use App\Jobs\GenerarCronogramaJob;
use App\Models\Solicitud;
use App\Services\ApprovalService;
use App\Services\DesembolsoService;
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

        // Filtro opcional por estado(s): ?estado=PENDIENTE_SUPERVISOR,PENDIENTE_ADMINISTRADOR
        if ($estado = $request->query('estado')) {
            $estados = is_array($estado) ? $estado : explode(',', $estado);
            $query->whereIn('estado', $estados);
        }

        // Búsqueda por N° de crédito, nombre o cédula del cliente
        if ($buscar = $request->query('buscar')) {
            $query->where(function ($q) use ($buscar) {
                $q->where('numero_credito', 'ilike', "%{$buscar}%")
                  ->orWhereHas('cliente', function ($c) use ($buscar) {
                      $c->where('nombres', 'ilike', "%{$buscar}%")
                        ->orWhere('apellidos', 'ilike', "%{$buscar}%")
                        ->orWhere('numero_documento', 'ilike', "%{$buscar}%");
                  });
            });
        }

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

        // El crédito hereda cobrador y área del CLIENTE (para visibilidad correcta por rol)
        $cliente = \App\Models\Cliente::findOrFail($data['cliente_id']);

        // Número de cuotas = plazo (meses) × periodos por mes de la modalidad
        $factor = \App\Services\LoanService::periodosPorMes($data['modalidad']);
        $numeroCuotas = (int) $data['plazo_meses'] * $factor;
        $data['numero_cuotas'] = $numeroCuotas;

        $solicitud = new Solicitud([
            'cliente_id'         => $data['cliente_id'],
            'area_id'            => $cliente->area_id,
            'cobrador_id'        => $cliente->cobrador_id ?? $request->user()->id,
            'producto_id'        => $data['producto_id'] ?? null,
            'es_venta_financiada'=> $data['es_venta_financiada'] ?? false,
            'capital_solicitado' => $data['capital_solicitado'],
            'tipo_interes'       => $data['tipo_interes'] ?? 'FIJO',
            'numero_cuotas'      => $numeroCuotas,
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
        return new SolicitudResource($solicitud->load(['cliente', 'cuotas', 'pagos' => fn ($q) => $q->latest(), 'pagos.registrador', 'creditoOrigen']));
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

    public function desembolsar(Request $request, Solicitud $solicitud, DesembolsoService $svc)
    {
        $this->authorize('disburse', $solicitud);
        $data = $request->validate([
            'metodo' => ['required', 'in:EFECTIVO,TRANSFERENCIA'],
            'valor'  => ['nullable', 'numeric', 'gt:0'],
            'fecha'  => ['nullable', 'date'],
        ]);
        $solicitud = $svc->desembolsar($solicitud, $data, $request->user());
        return new SolicitudResource($solicitud);
    }

    public function generarCronograma(Solicitud $solicitud, LoanService $loans)
    {
        $this->authorize('disburse', $solicitud);

        // Idempotente: solo genera si aún no hay cuotas (no destruye pagos existentes)
        if (\App\Models\Cuota::where('solicitud_id', $solicitud->id)->count() === 0) {
            $fechaBase = \App\Models\Desembolso::where('solicitud_id', $solicitud->id)->value('fecha') ?? now();
            $loans->generarCronograma($solicitud, $fechaBase);
        }

        return new SolicitudResource($solicitud->fresh()->load('cuotas'));
    }
}

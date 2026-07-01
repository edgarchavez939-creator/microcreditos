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

        // Plan de cuotas al crear la solicitud (fecha provisional; se recalcula al desembolsar)
        try {
            $this->loans->generarCronograma($solicitud, $data['fecha_primer_pago'] ?? now());
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('No se pudo generar el plan al crear la solicitud: '.$e->getMessage());
        }

        return (new SolicitudResource($solicitud->fresh()->load('cuotas')))
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
            'fecha'  => ['required', 'date'],
        ]);
        $solicitud = $svc->desembolsar($solicitud, $data, $request->user());
        return new SolicitudResource($solicitud);
    }

    public function generarCronograma(Solicitud $solicitud, LoanService $loans)
    {
        $this->authorize('disburse', $solicitud);

        $nc    = (int) $solicitud->numero_cuotas;
        $antes = \App\Models\Cuota::where('solicitud_id', $solicitud->id)->count();

        try {
            if ($antes === 0) {
                $fechaBase = \App\Models\Desembolso::where('solicitud_id', $solicitud->id)->value('fecha') ?? now();
                $loans->generarCronograma($solicitud, $fechaBase);
            }
        } catch (\Throwable $e) {
            return response()->json([
                'message' => 'ERROR: '.$e->getMessage().' @'.class_basename($e->getFile()).':'.$e->getLine(),
            ], 422);
        }

        $despues = \App\Models\Cuota::where('solicitud_id', $solicitud->id)->count();

        return response()->json([
            'message' => "Diagnóstico → numero_cuotas={$nc} · cuotas antes={$antes} · después={$despues}",
            'diag'    => ['numero_cuotas' => $nc, 'antes' => $antes, 'despues' => $despues],
        ]);
    }

    public function destroy(Request $request, Solicitud $solicitud)
    {
        $u = $request->user();
        if (! $u->esAdministrador()) {
            abort(403, 'Solo el administrador puede eliminar créditos.');
        }
        $request->validate(['clave' => ['required', 'string']]);
        if ($request->input('clave') !== config('app.credito_delete_key')) {
            abort(422, 'Clave de eliminación incorrecta.');
        }

        \Illuminate\Support\Facades\DB::transaction(function () use ($solicitud) {
            $pagoIds = \App\Models\Pago::where('solicitud_id', $solicitud->id)->pluck('id');
            \App\Models\MovimientoCaja::where(function ($q) use ($solicitud, $pagoIds) {
                $q->where(fn ($x) => $x->where('referencia_tipo', 'DESEMBOLSO')->where('referencia_id', $solicitud->id))
                  ->orWhere(fn ($x) => $x->where('referencia_tipo', 'PAGO')->whereIn('referencia_id', $pagoIds));
            })->delete();
            \App\Models\Pago::where('solicitud_id', $solicitud->id)->delete();
            \App\Models\Cuota::where('solicitud_id', $solicitud->id)->delete();
            \App\Models\Desembolso::where('solicitud_id', $solicitud->id)->delete();
            \App\Models\Documento::where('solicitud_id', $solicitud->id)->delete();
            \Illuminate\Support\Facades\DB::table('renovaciones')
                ->where('credito_origen_id', $solicitud->id)
                ->orWhere('credito_nuevo_id', $solicitud->id)->delete();
            $solicitud->delete();
        });

        return response()->json(['message' => 'Crédito eliminado.']);
    }
}

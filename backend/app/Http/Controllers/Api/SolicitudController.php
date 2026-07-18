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
use Illuminate\Support\Facades\DB;

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

        // Modelo territorial: cobrador y supervisor ven las solicitudes cuyo CLIENTE
        // pertenece a sus áreas. Se filtra por el área del cliente (join en vivo), no
        // por un área almacenada en el crédito: así un cambio de área del cliente
        // reasigna la visibilidad automáticamente, sin tocar los créditos.
        $u = $request->user();
        $areas = $u->areasVisibles();
        if ($areas !== null) {
            $query->whereIn(
                'cliente_id',
                \Illuminate\Support\Facades\DB::table('clientes')->whereIn('area_id', $areas)->select('id')
            );
        }

        return SolicitudResource::collection($query->paginate(20));
    }

    public function store(StoreSolicitudRequest $request)
    {
        $this->authorize('create', Solicitud::class);
        $data = $request->validated();

        // El crédito hereda cobrador y área del CLIENTE (para visibilidad correcta por rol)
        $cliente = \App\Models\Cliente::findOrFail($data['cliente_id']);

        // MOTOR DE PRODUCTOS: la solicitud se valida contra la CONFIGURACIÓN del
        // producto elegido (límites, frecuencias, tasa/seguro fijos o modificables).
        // Si no se envía producto, se usa el TRADICIONAL (compatibilidad).
        $motor = app(\App\Services\ProductoFinancieroService::class);
        $productoId = $data['producto_financiero_id']
            ?? \Illuminate\Support\Facades\DB::table('productos_financieros')->where('codigo', 'TRADICIONAL')->value('id');
        $producto = $motor->obtenerActivo((int) $productoId);
        $numeroCuotasPre = (int) $data['plazo_meses'] * \App\Services\LoanService::periodosPorMes($data['modalidad']);
        $normalizado = $motor->validarSolicitud($producto, $data + ['numero_cuotas' => $numeroCuotasPre]);

        // Número de cuotas = plazo (meses) × periodos por mes de la modalidad
        $factor = \App\Services\LoanService::periodosPorMes($data['modalidad']);
        $numeroCuotas = (int) $data['plazo_meses'] * $factor;

        $exonerado = (bool) ($data['seguro_exonerado'] ?? false);
        // Si el producto no usa seguro, no aplica exoneración (no hay nada que exonerar)
        if (! $producto->usa_seguro) {
            $exonerado = false;
        }

        // NUEVO FLUJO: la solicitud se crea SIN monto aprobado. El capital aprobado,
        // el seguro, los intereses y el cronograma se definen durante la APROBACIÓN.
        // Aquí solo se registra lo solicitado y las condiciones base del préstamo.
        $solicitud = new Solicitud([
            'cliente_id'          => $data['cliente_id'],
            'area_id'             => $cliente->area_id,
            'cobrador_id'         => $cliente->cobrador_id ?? $request->user()->id,
            'producto_id'         => $data['producto_id'] ?? null,   // artículo (venta financiada)
            'producto_financiero_id' => $producto->id,
            'producto_version'    => (int) $producto->version_actual,
            'valor_pactado'       => $normalizado['valor_pactado'],
            'es_venta_financiada' => $data['es_venta_financiada'] ?? false,
            'capital_solicitado'  => $data['capital_solicitado'],
            'tipo_interes'        => $data['tipo_interes'] ?? 'FIJO',
            'numero_cuotas'       => $numeroCuotas,
            'tasa_interes'        => $normalizado['tasa_interes'],
            'modalidad'           => $data['modalidad'],
            // Condiciones de seguro/plazo se guardan para aplicarlas al aprobar
            'porcentaje_seguro'   => $exonerado ? 0 : $normalizado['porcentaje_seguro'],
            'seguro_exonerado'    => $exonerado,
            'motivo_exoneracion'  => $data['motivo_exoneracion'] ?? null,
            'fecha_primer_pago'   => $data['fecha_primer_pago'] ?? null,
            // Sin monto_aprobado todavía (queda NULL hasta la aprobación)
            // El estado inicial lo decide el motor: config del producto + monto vs límites.
            'estado'              => $this->approvals->estadoInicial(
                (float) $data['capital_solicitado'], $exonerado, $producto
            ),
            'created_by'          => $request->user()->id,
        ]);

        // MARCA DE RENOVACIÓN (trazabilidad padre-hijo): si la solicitud proviene de
        // una renovación, se valida contra el servicio central que el origen sea
        // exactamente el crédito renovable vigente del cliente (último pagado,
        // dentro de la ventana) y se deja la relación permanente.
        if (! empty($data['credito_origen_id'])) {
            $renovable = app(\App\Services\RenovacionService::class)->creditoRenovable($cliente->id);
            if ($renovable && (int) $renovable['solicitud_id'] === (int) $data['credito_origen_id']) {
                $solicitud->credito_origen_id = (int) $data['credito_origen_id'];
                $solicitud->tipo_origen       = 'RENOVACION';
                $solicitud->renovado_por      = $request->user()->id;
            }
            // Si no coincide (origen inválido o ventana vencida), la solicitud se crea
            // igual pero SIN marca: no se falsifica una renovación que no procede.
        }
        if ($exonerado) {
            $solicitud->exoneracion_solicitada_por = $request->user()->id;
        }
        $solicitud->save();

        // No se calculan montos ni se genera cronograma: eso ocurre al aprobar el capital.
        return (new SolicitudResource($solicitud->fresh()))
            ->response()->setStatusCode(201);
    }

    public function show(Solicitud $solicitud)
    {
        if (request()->user()->cannot('view', $solicitud)) {
            return $this->denegarConDiagnostico($solicitud);
        }

        // Auto-reparación: si el crédito debería tener plan y no lo tiene, generarlo aquí mismo.
        if ((int) $solicitud->numero_cuotas > 0
            && (float) $solicitud->monto_aprobado > 0
            && ! in_array($solicitud->estado, ['RECHAZADO'], true)
            && \App\Models\Cuota::where('solicitud_id', $solicitud->id)->count() === 0) {
            try {
                $fechaBase = \App\Models\Desembolso::where('solicitud_id', $solicitud->id)->value('fecha')
                    ?? $solicitud->fecha_primer_pago
                    ?? now();
                $this->loans->generarCronograma($solicitud, $fechaBase);
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::warning("Auto-reparación de plan falló (solicitud {$solicitud->id}): ".$e->getMessage());
            }
        }

        $solicitud->load(['cliente', 'pagos' => fn ($q) => $q->latest(), 'pagos.registrador', 'creditoOrigen']);

        // Cargar las cuotas con consulta directa (verificada) e inyectarlas en el modelo.
        // Nota: la carga por relación fallaba en producción para este caso; esta vía es equivalente y comprobada.
        $solicitud->setRelation(
            'cuotas',
            \App\Models\Cuota::where('solicitud_id', $solicitud->id)->orderBy('numero_cuota')->get(),
        );

        return new SolicitudResource($solicitud);
    }

    public function aprobar(Solicitud $solicitud, Request $request)
    {
        $this->authorize('approve', $solicitud);

        // El capital aprobado se define AQUÍ, en la aprobación (no en la solicitud).
        // El aprobador puede aprobar igual, menor o mayor al solicitado, según reglas.
        $data = $request->validate([
            'monto_aprobado' => ['required', 'numeric', 'gt:0'],
        ]);

        // Reconstruir los parámetros de cálculo desde la propia solicitud (guardados al crearla)
        $factor = \App\Services\LoanService::periodosPorMes($solicitud->modalidad);
        $plazoMeses = max(1, (int) round(((int) $solicitud->numero_cuotas) / $factor));

        $datosCalculo = [
            'monto_aprobado'     => $data['monto_aprobado'],
            'tasa_interes'       => (float) $solicitud->tasa_interes,
            'numero_cuotas'      => (int) $solicitud->numero_cuotas,
            'modalidad'          => $solicitud->modalidad,
            'plazo_meses'        => $plazoMeses,
            'seguro_exonerado'   => (bool) $solicitud->seguro_exonerado,
            'porcentaje_seguro'  => (float) $solicitud->porcentaje_seguro,
            'motivo_exoneracion' => $solicitud->motivo_exoneracion,
            'fecha_primer_pago'  => $solicitud->fecha_primer_pago,
        ];

        // 1) Calcular seguro, interés, total y cuota sobre el monto aprobado
        $solicitud = $this->loans->calcularMontos($solicitud, $datosCalculo, $request->user()->id);
        $solicitud->save();

        // 2) Validar límite y transicionar a APROBADO (con auditoría completa del intento)
        $estadoAnterior = $solicitud->estado;
        $limiteVigente = $this->approvals->limiteVigente($request->user()->rol);
        try {
            $solicitud = $this->approvals->aprobar($solicitud, $request->user());
        } catch (\DomainException $e) {
            // Auditar el intento FALLIDO de aprobación
            $this->auditarAprobacion($request, $solicitud, $estadoAnterior, $estadoAnterior,
                (float) $data['monto_aprobado'], $limiteVigente, 'FALLIDO', $e->getMessage());
            return response()->json(['message' => $e->getMessage()], 422);
        }

        // Auditar la aprobación EXITOSA
        $this->auditarAprobacion($request, $solicitud, $estadoAnterior, $solicitud->estado,
            (float) $data['monto_aprobado'], $limiteVigente, 'APROBADO', null);

        // 3) Generar el cronograma provisional (se recalcula al desembolsar con la fecha real)
        try {
            $this->loans->generarCronograma($solicitud, $solicitud->fecha_primer_pago ?? now());
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning("No se pudo generar el plan al aprobar (solicitud {$solicitud->id}): ".$e->getMessage());
        }

        return new SolicitudResource($solicitud->fresh()->load(['cuotas', 'cliente']));
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

        try {
            // Idempotente: solo genera si aún no hay cuotas (no destruye pagos existentes)
            if (\App\Models\Cuota::where('solicitud_id', $solicitud->id)->count() === 0) {
                $fechaBase = \App\Models\Desembolso::where('solicitud_id', $solicitud->id)->value('fecha') ?? now();
                $loans->generarCronograma($solicitud, $fechaBase);
            }
        } catch (\Throwable $e) {
            return response()->json(['message' => 'No se pudo generar el plan: '.$e->getMessage()], 422);
        }

        return $this->show($solicitud);
    }

    public function destroy(Request $request, Solicitud $solicitud)
    {
        $u = $request->user();
        if (! $u->esAdministrador()) {
            abort(403, 'Solo el administrador puede eliminar créditos.');
        }
        $request->validate(['otp' => ['required', 'string', 'digits:6']]);
        if (! app(\App\Services\OtpService::class)->consumir($request->user(), 'ELIMINAR_CREDITO', $request->input('otp'))) {
            abort(422, 'Código de seguridad incorrecto, vencido o ya utilizado. Genera uno nuevo.');
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

    /** Línea de tiempo del crédito: creación, aprobación, desembolso, pagos, reamortizaciones. */
    /** Evalúa el scoring de renovación de un crédito (variables de comportamiento de pago). */
    public function evaluarRenovacion(Request $request, Solicitud $solicitud, \App\Services\RenovacionService $renovaciones)
    {
        $eleg = $renovaciones->esElegible($solicitud);
        if (! $eleg['elegible']) {
            return response()->json(['data' => ['elegible' => false, 'motivo' => $eleg['motivo']]]);
        }
        $scoring = $renovaciones->evaluar($solicitud->cliente_id, $solicitud->id);

        // Auditar la consulta de scoring (trazabilidad de decisiones de crédito)
        DB::table('auditoria')->insert([
            'usuario_id'  => $request->user()->id,
            'accion'      => 'SCORING_RENOVACION',
            'entidad'     => 'solicitud',
            'entidad_id'  => $solicitud->id,
            'datos_nuevos'=> json_encode($scoring, JSON_UNESCAPED_UNICODE),
            'ip'          => $request->ip(),
            'user_agent'  => $request->userAgent(),
            'created_at'  => now(),
        ]);

        return response()->json(['data' => array_merge(['elegible' => true], $scoring)]);
    }

    public function eventos(Solicitud $solicitud)
    {
        $this->authorize('view', $solicitud);

        $nombres = fn ($id) => $id
            ? \App\Models\Usuario::where('id', $id)->value('nombre')
            : null;

        $eventos = [];

        // 1) Creación
        $eventos[] = [
            'fecha'   => $solicitud->created_at?->toIso8601String(),
            'tipo'    => 'CREACION',
            'titulo'  => 'Solicitud creada',
            'detalle' => 'Capital solicitado: $' . number_format((float) $solicitud->capital_solicitado, 0, ',', '.'),
            'usuario' => $nombres($solicitud->created_by),
        ];

        // 2) Aprobación o rechazo
        if ($solicitud->fecha_aprobacion) {
            $rechazado = $solicitud->estado === 'RECHAZADO' || ! empty($solicitud->motivo_rechazo);
            $eventos[] = [
                'fecha'   => \Illuminate\Support\Carbon::parse($solicitud->fecha_aprobacion)->toIso8601String(),
                'tipo'    => $rechazado ? 'RECHAZO' : 'APROBACION',
                'titulo'  => $rechazado ? 'Solicitud rechazada' : 'Crédito aprobado',
                'detalle' => $rechazado
                    ? ('Motivo: ' . ($solicitud->motivo_rechazo ?? '—'))
                    : ('Monto aprobado: $' . number_format((float) $solicitud->monto_aprobado, 0, ',', '.')
                        . ' · N° ' . ($solicitud->numero_credito ?? '—')),
                'usuario' => $nombres($solicitud->usuario_aprobador),
            ];
        }

        // 3) Desembolsos
        foreach (\App\Models\Desembolso::where('solicitud_id', $solicitud->id)->get() as $d) {
            $eventos[] = [
                'fecha'   => ($d->created_at ?? $d->fecha)?->toIso8601String(),
                'tipo'    => 'DESEMBOLSO',
                'titulo'  => 'Desembolso realizado',
                'detalle' => '$' . number_format((float) $d->valor, 0, ',', '.') . ' · ' . ucfirst(strtolower($d->metodo))
                    . ' · Inicio del crédito: ' . \Illuminate\Support\Carbon::parse($d->fecha)->format('d/m/Y'),
                'usuario' => $nombres($d->registrado_por),
            ];
        }

        // 4) Pagos
        foreach (\App\Models\Pago::where('solicitud_id', $solicitud->id)->orderBy('created_at')->get() as $pg) {
            $eventos[] = [
                'fecha'   => ($pg->created_at ?? $pg->fecha)?->toIso8601String(),
                'tipo'    => 'PAGO',
                'titulo'  => 'Pago recibido',
                'detalle' => '$' . number_format((float) $pg->valor, 0, ',', '.') . ' · ' . ucfirst(strtolower($pg->metodo))
                    . ($pg->observaciones ? ' · ' . $pg->observaciones : ''),
                'usuario' => $nombres($pg->registrado_por),
            ];
        }

        // 5) Reamortizaciones (como origen o como crédito nuevo)
        $renos = \Illuminate\Support\Facades\DB::table('renovaciones')
            ->where('credito_origen_id', $solicitud->id)
            ->orWhere('credito_nuevo_id', $solicitud->id)->get();
        foreach ($renos as $r) {
            $esOrigen = (int) $r->credito_origen_id === (int) $solicitud->id;
            $otro = \App\Models\Solicitud::where('id', $esOrigen ? $r->credito_nuevo_id : $r->credito_origen_id)
                ->value('numero_credito');
            $eventos[] = [
                'fecha'   => \Illuminate\Support\Carbon::parse($r->fecha_renovacion)->toIso8601String(),
                'tipo'    => 'REAMORTIZACION',
                'titulo'  => $esOrigen ? 'Crédito reamortizado' : 'Crédito creado por reamortización',
                'detalle' => ($esOrigen ? 'Continúa en ' : 'Proviene de ') . ($otro ?? 'otro crédito')
                    . ' · Saldo refinanciado: $' . number_format((float) $r->saldo_refinanciado, 0, ',', '.'),
                'usuario' => $nombres($r->realizado_por),
            ];
        }

        // 6) Cierre
        if ($solicitud->estado === 'FINALIZADO') {
            $ultimoPago = \App\Models\Pago::where('solicitud_id', $solicitud->id)->max('created_at');
            $eventos[] = [
                'fecha'   => $ultimoPago ? \Illuminate\Support\Carbon::parse($ultimoPago)->toIso8601String() : now()->toIso8601String(),
                'tipo'    => 'CIERRE',
                'titulo'  => 'Crédito finalizado',
                'detalle' => 'Deuda saldada en su totalidad.',
                'usuario' => null,
            ];
        }

        usort($eventos, fn ($a, $b) => strcmp($a['fecha'] ?? '', $b['fecha'] ?? ''));

        return response()->json(['data' => $eventos]);
    }

    /** Cuotas del crédito por consulta directa (endpoint dedicado, a prueba de cachés). */
    public function cuotas(Solicitud $solicitud)
    {
        if (request()->user()->cannot('view', $solicitud)) {
            return $this->denegarConDiagnostico($solicitud);
        }

        // Auto-reparación: generar el plan si falta y debería existir
        if ((int) $solicitud->numero_cuotas > 0
            && (float) $solicitud->monto_aprobado > 0
            && $solicitud->estado !== 'RECHAZADO'
            && \App\Models\Cuota::where('solicitud_id', $solicitud->id)->count() === 0) {
            try {
                $fechaBase = \App\Models\Desembolso::where('solicitud_id', $solicitud->id)->value('fecha')
                    ?? $solicitud->fecha_primer_pago ?? now();
                $this->loans->generarCronograma($solicitud, $fechaBase);
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::warning("Autogeneración de plan falló (solicitud {$solicitud->id}): ".$e->getMessage());
            }
        }

        $cuotas = \App\Models\Cuota::where('solicitud_id', $solicitud->id)
            ->orderBy('numero_cuota')
            ->get()
            ->map(fn ($c) => [
                'id'                => $c->id,
                'numero_cuota'      => (int) $c->numero_cuota,
                'fecha_vencimiento' => $c->fecha_vencimiento?->format('Y-m-d'),
                'valor'             => (float) $c->valor,
                'abono_capital'     => (float) $c->abono_capital,
                'abono_interes'     => (float) $c->abono_interes,
                'valor_pagado'      => (float) $c->valor_pagado,
                'saldo'             => (float) $c->saldo,
                'estado'            => $c->estado,
            ]);

        // Extracto: pagos del crédito (más reciente primero)
        $pagos = \App\Models\Pago::where('solicitud_id', $solicitud->id)
            ->leftJoin('usuarios', 'usuarios.id', '=', 'pagos.registrado_por')
            ->orderByDesc('pagos.created_at')
            ->get([
                'pagos.id', 'pagos.fecha', 'pagos.created_at', 'pagos.valor',
                'pagos.metodo', 'pagos.observaciones', 'pagos.aplicado', 'usuarios.nombre as registrado_por',
            ])
            ->map(fn ($p) => [
                'id'             => $p->id,
                'fecha'          => \Illuminate\Support\Carbon::parse($p->fecha)->format('Y-m-d'),
                'hora'           => $p->created_at ? \Illuminate\Support\Carbon::parse($p->created_at)->timezone('America/Bogota')->format('h:i a') : null,
                'valor'          => (float) $p->valor,
                'metodo'         => $p->metodo,
                'observaciones'  => $p->observaciones,
                'registrado_por' => $p->registrado_por,
                'aplicado'       => (bool) $p->aplicado,
            ]);

        return response()
            ->json(['data' => $cuotas, 'pagos' => $pagos, 'total' => $cuotas->count()])
            ->header('Cache-Control', 'no-store, no-cache, must-revalidate');
    }

    /**
     * Genera el PDF del extracto del crédito con el diseño institucional.
     * Accesible con JWT (descarga desde la app) o con URL firmada (enlace para WhatsApp).
     */
    public function extractoPdf(Solicitud $solicitud, Request $request)
    {
        // Autorización: o viene firmado (enlace público temporal) o el usuario puede ver el crédito
        if (! $request->hasValidSignature() && (! $request->user() || $request->user()->cannot('view', $solicitud))) {
            abort(403, 'No autorizado para ver este extracto.');
        }

        $solicitud->loadMissing('cliente');
        $money = fn ($v) => '$' . number_format((float) $v, 0, ',', '.');
        $fFecha = fn ($v) => $v ? \Illuminate\Support\Carbon::parse($v)->format('d/m/Y') : '';

        $cuotas = \App\Models\Cuota::where('solicitud_id', $solicitud->id)
            ->orderBy('numero_cuota')->get()
            ->map(fn ($c) => [
                'numero_cuota'      => (int) $c->numero_cuota,
                'fecha_vencimiento' => $c->fecha_vencimiento ? \Illuminate\Support\Carbon::parse($c->fecha_vencimiento)->format('d/m/Y') : '',
                'valor'             => (float) $c->valor,
                'valor_pagado'      => (float) $c->valor_pagado,
                'saldo'             => (float) $c->saldo,
                'estado'            => $c->estado,
            ])->all();

        $pagos = \App\Models\Pago::where('solicitud_id', $solicitud->id)
            ->where('aplicado', true)
            ->leftJoin('usuarios', 'usuarios.id', '=', 'pagos.registrado_por')
            ->orderBy('pagos.fecha')
            ->get(['pagos.fecha', 'pagos.valor', 'pagos.metodo', 'usuarios.nombre as registrado_por'])
            ->map(fn ($p) => [
                'fecha'          => \Illuminate\Support\Carbon::parse($p->fecha)->format('d/m/Y'),
                'valor'          => (float) $p->valor,
                'metodo'         => $p->metodo,
                'registrado_por' => $p->registrado_por,
            ])->all();

        $totalPagado = (float) \App\Models\Pago::where('solicitud_id', $solicitud->id)
            ->where('aplicado', true)->sum('valor');

        $modLabel = ['DIARIO' => 'Diario', 'SEMANAL' => 'Semanal', 'QUINCENAL' => 'Quincenal', 'MENSUAL' => 'Mensual'];

        $datos = [
            's'           => $solicitud,
            'empresa'     => config('app.name', 'Microcréditos'),
            'generado'    => now()->timezone('America/Bogota')->format('d/m/Y h:i a'),
            'cliente'     => $solicitud->cliente ? trim("{$solicitud->cliente->nombres} {$solicitud->cliente->apellidos}") : '—',
            'documento'   => $solicitud->cliente ? "{$solicitud->cliente->tipo_documento} {$solicitud->cliente->numero_documento}" : '—',
            'modalidad'   => $modLabel[$solicitud->modalidad] ?? $solicitud->modalidad,
            'cuotas'      => $cuotas,
            'pagos'       => $pagos,
            'totalPagado' => $totalPagado,
            'saldo'       => $solicitud->saldoPendiente(),
            'money'       => $money,
        ];

        try {
            if (! class_exists(\Barryvdh\DomPDF\Facade\Pdf::class)) {
                return response()->json([
                    'message' => 'El generador de PDF (dompdf) no está instalado en el servidor. Se requiere redesplegar el backend.',
                ], 500);
            }
            $pdf = \Barryvdh\DomPDF\Facade\Pdf::loadView('pdf.extracto', $datos)->setPaper('a4');
            $nombre = 'extracto_' . ($solicitud->numero_credito ?? $solicitud->id) . '.pdf';
            return $pdf->download($nombre);
        } catch (\Throwable $e) {
            return response()->json([
                'message' => 'Error generando el PDF: '.$e->getMessage(),
            ], 500);
        }
    }

    /** Devuelve un enlace firmado y temporal al PDF del extracto (para compartir por WhatsApp). */
    public function extractoEnlace(Solicitud $solicitud, Request $request)
    {
        if ($request->user()->cannot('view', $solicitud)) {
            abort(403, 'No autorizado.');
        }
        $url = \Illuminate\Support\Facades\URL::temporarySignedRoute(
            'extracto.pdf', now()->addDays(7), ['solicitud' => $solicitud->id]
        );
        return response()->json(['data' => ['url' => $url]]);
    }

    /** 403 auto-explicativo: muestra qué evaluó el permiso y qué rama falló. */
    /** Registra en auditoría cada aprobación o intento fallido con todos los datos del flujo. */
    private function auditarAprobacion(Request $request, Solicitud $solicitud, string $estadoAnterior,
        string $estadoNuevo, float $montoSolicitado, float $limiteVigente, string $resultado, ?string $mensaje): void
    {
        $u = $request->user();
        DB::table('auditoria')->insert([
            'usuario_id'  => $u->id,
            'accion'      => $resultado === 'APROBADO' ? 'APPROVE' : 'APPROVE_DENIED',
            'entidad'     => 'solicitud',
            'entidad_id'  => $solicitud->id,
            'datos_nuevos' => json_encode([
                'rol'               => $u->rol,
                'estado_anterior'   => $estadoAnterior,
                'estado_nuevo'      => $estadoNuevo,
                'monto_solicitado'  => $montoSolicitado,
                'limite_vigente'    => $limiteVigente,
                'resultado'         => $resultado,
                'mensaje'           => $mensaje,
                'created_by'        => $solicitud->created_by,
            ], JSON_UNESCAPED_UNICODE),
            'ip'          => $request->ip(),
            'user_agent'  => $request->userAgent(),
            'created_at'  => now(),
        ]);
    }

    private function denegarConDiagnostico(Solicitud $solicitud)
    {
        $u = request()->user();
        $areaCliente     = \Illuminate\Support\Facades\DB::table('clientes')->where('id', $solicitud->cliente_id)->value('area_id');
        $cobradorCliente = \Illuminate\Support\Facades\DB::table('clientes')->where('id', $solicitud->cliente_id)->value('cobrador_id');
        $areasUsuario    = \Illuminate\Support\Facades\DB::table('usuario_area')->where('usuario_id', (int) $u->id)->pluck('area_id');

        return response()->json([
            'message' => 'This action is unauthorized.',
            'diag' => [
                'usuario'   => ['id' => $u->id, 'tipo_id' => gettype($u->id), 'rol' => $u->rol, 'clase' => get_class($u)],
                'solicitud' => [
                    'id' => $solicitud->id, 'cobrador_id' => $solicitud->cobrador_id,
                    'tipo_cobrador_id' => gettype($solicitud->cobrador_id),
                    'area_id' => $solicitud->area_id, 'created_by' => $solicitud->created_by,
                    'cliente_id' => $solicitud->cliente_id,
                ],
                'cliente'   => ['area_id' => $areaCliente, 'cobrador_id' => $cobradorCliente],
                'areas_del_usuario' => $areasUsuario,
                'ramas' => [
                    'es_admin'          => $u->esAdministrador(),
                    'es_supervisor'     => $u->esSupervisor(),
                    'es_cobrador'       => $u->esCobrador(),
                    'cobrador_match'    => (int) $solicitud->cobrador_id === (int) $u->id,
                    'creador_match'     => (int) $solicitud->created_by === (int) $u->id,
                    'cliente_cobrador_match' => $cobradorCliente !== null && (int) $cobradorCliente === (int) $u->id,
                ],
            ],
        ], 403);
    }
}

<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Transferencia;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Services\PaymentService;

class TransferenciaController extends Controller
{
    /**
     * Autorización para validar transferencias.
     * Consulta el MOTOR DE PERMISOS ('transferencias.validar') en lugar de cablear el
     * rol: así respeta lo que el administrador configure desde el módulo de permisos.
     */
    private function soloValidadores(Request $request): void
    {
        $u = $request->user();
        abort_unless(
            $u->esAdministrador() || app(\App\Services\PermisoService::class)->autoriza($u, 'transferencias.validar'),
            403,
            'No tienes permiso para validar transferencias.'
        );
    }

    public function index(Request $request)
    {
        $this->soloValidadores($request);
        $u = $request->user();

        $q = DB::table('transferencias as t')
            ->join('clientes as c', 'c.id', '=', 't.cliente_id')
            ->leftJoin('pagos as p', 'p.id', '=', 't.pago_id')
            ->leftJoin('solicitudes as s', 's.id', '=', 'p.solicitud_id')
            ->leftJoin('usuarios as ur', 'ur.id', '=', 't.registrado_por')
            ->leftJoin('usuarios as uv', 'uv.id', '=', 't.validado_por');

        // El supervisor solo ve transferencias de créditos de sus áreas
        if ($u->esSupervisor()) {
            $areas = $u->areas()->pluck('areas.id');
            $q->whereIn('s.area_id', $areas);
        }

        $estado = $request->query('estado', 'PENDIENTE_VALIDACION');
        if ($estado !== 'TODAS') {
            $q->where('t.estado', $estado);
        }

        $filas = $q->orderByDesc('t.created_at')->limit(100)->get([
            't.id', 't.banco', 't.referencia', 't.valor', 't.estado',
            't.motivo_rechazo', 't.created_at',
            's.numero_credito', 's.id as solicitud_id',
            DB::raw("TRIM(c.nombres || ' ' || c.apellidos) as cliente"),
            'ur.nombre as registrado_por', 'uv.nombre as validado_por', 't.validado_at',
        ]);

        return response()->json(['data' => $filas]);
    }

    /** Devuelve el comprobante (imagen base64) asociado al pago de la transferencia. */
    public function comprobante(Request $request, Transferencia $transferencia)
    {
        $this->soloValidadores($request);

        // Vínculo directo: el comprobante pertenece a ESTA transferencia y sobrevive
        // a cualquier cambio de estado (aprobada, rechazada) o reversión del pago.
        $doc = DB::table('documentos as d')
            ->leftJoin('usuarios as u', 'u.id', '=', 'd.subido_por')
            ->where('d.transferencia_id', $transferencia->id)
            ->whereNotNull('d.contenido_base64')
            ->orderByDesc('d.created_at')
            ->first(['d.mime', 'd.nombre_original', 'd.contenido_base64', 'd.created_at', 'u.nombre as subido_por']);

        // Compatibilidad con comprobantes antiguos (sin vínculo directo)
        if (! $doc && $transferencia->pago_id) {
            $pago = DB::table('pagos')->where('id', $transferencia->pago_id)->first();
            if ($pago) {
                $doc = DB::table('documentos as d')
                    ->leftJoin('usuarios as u', 'u.id', '=', 'd.subido_por')
                    ->where('d.solicitud_id', $pago->solicitud_id)
                    ->where('d.categoria', 'COMPROBANTE_PAGO')
                    ->whereNotNull('d.contenido_base64')
                    ->orderByDesc('d.created_at')
                    ->first(['d.mime', 'd.nombre_original', 'd.contenido_base64', 'd.created_at', 'u.nombre as subido_por']);
            }
        }

        abort_unless($doc, 404, 'Esta transferencia no tiene comprobante adjunto.');

        return response()->json(['data' => [
            'mime'        => $doc->mime,
            'nombre'      => $doc->nombre_original,
            'base64'      => $doc->contenido_base64,
            'fecha_carga' => \Illuminate\Support\Carbon::parse($doc->created_at)->timezone('America/Bogota')->format('Y-m-d h:i a'),
            'subido_por'  => $doc->subido_por,
        ]]);
    }

    public function aprobar(Request $request, Transferencia $transferencia, PaymentService $pagos)
    {
        $this->soloValidadores($request);
        abort_unless($transferencia->estado === 'PENDIENTE_VALIDACION', 422, 'Esta transferencia ya fue validada.');

        // 1) Aplicar el pago (cuotas + caja + cierre si queda saldado)
        $pagos->aplicarPagoAprobado($transferencia, $request->user());

        // 2) Marcar la transferencia como aprobada
        $transferencia->update([
            'estado'       => 'APROBADO',
            'validado_por' => $request->user()->id,
            'validado_at'  => now(),
        ]);

        return response()->json(['message' => 'Transferencia aprobada y pago aplicado.']);
    }

    public function rechazar(Request $request, Transferencia $transferencia, PaymentService $pagos)
    {
        $this->soloValidadores($request);
        abort_unless($transferencia->estado === 'PENDIENTE_VALIDACION', 422, 'Esta transferencia ya fue validada.');

        $data = $request->validate(['motivo' => ['required', 'string', 'min:5', 'max:500']]);

        // 1) Revertir el pago: se elimina, se recalculan las cuotas y la caja.
        $pagos->revertirPagoDeTransferencia($transferencia);

        // 2) Marcar la transferencia como rechazada (conserva banco/referencia/motivo).
        $transferencia->update([
            'estado'         => 'RECHAZADO',
            'motivo_rechazo' => $data['motivo'],
            'validado_por'   => $request->user()->id,
            'validado_at'    => now(),
        ]);

        return response()->json(['message' => 'Transferencia rechazada y pago revertido.']);
    }
}

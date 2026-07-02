<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Transferencia;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class TransferenciaController extends Controller
{
    /** Solo supervisor o administrador validan transferencias. */
    private function soloValidadores(Request $request): void
    {
        $u = $request->user();
        abort_unless($u->esAdministrador() || $u->esSupervisor(), 403,
            'Solo el supervisor o el administrador pueden validar transferencias.');
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

        $pago = DB::table('pagos')->where('id', $transferencia->pago_id)->first();
        abort_unless($pago, 404, 'Pago no encontrado.');

        // El comprobante se guardó como Documento del crédito, categoría COMPROBANTE_PAGO,
        // subido por quien registró el pago alrededor de la misma fecha.
        $doc = DB::table('documentos')
            ->where('solicitud_id', $pago->solicitud_id)
            ->where('categoria', 'COMPROBANTE_PAGO')
            ->whereNotNull('contenido_base64')
            ->orderByDesc('created_at')
            ->first(['id', 'mime', 'nombre_original', 'contenido_base64', 'created_at']);

        abort_unless($doc, 404, 'Esta transferencia no tiene comprobante adjunto.');

        return response()->json(['data' => [
            'mime'   => $doc->mime,
            'nombre' => $doc->nombre_original,
            'base64' => $doc->contenido_base64,
        ]]);
    }

    public function aprobar(Request $request, Transferencia $transferencia)
    {
        $this->soloValidadores($request);
        abort_unless($transferencia->estado === 'PENDIENTE_VALIDACION', 422, 'Esta transferencia ya fue validada.');

        $transferencia->update([
            'estado'       => 'APROBADO',
            'validado_por' => $request->user()->id,
            'validado_at'  => now(),
        ]);

        return response()->json(['message' => 'Transferencia aprobada.']);
    }

    public function rechazar(Request $request, Transferencia $transferencia)
    {
        $this->soloValidadores($request);
        abort_unless($transferencia->estado === 'PENDIENTE_VALIDACION', 422, 'Esta transferencia ya fue validada.');

        $data = $request->validate(['motivo' => ['required', 'string', 'min:5', 'max:500']]);

        $transferencia->update([
            'estado'         => 'RECHAZADO',
            'motivo_rechazo' => $data['motivo'],
            'validado_por'   => $request->user()->id,
            'validado_at'    => now(),
        ]);

        return response()->json(['message' => 'Transferencia rechazada.']);
    }
}

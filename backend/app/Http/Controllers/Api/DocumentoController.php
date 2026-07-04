<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DocumentoController extends Controller
{
    private const CATEGORIAS = [
        'CEDULA_FRONTAL', 'CEDULA_POSTERIOR', 'CARTA_LABORAL', 'SOPORTE_INGRESOS',
        'PAGARE', 'COMPROBANTE_PAGO', 'SOPORTE_DESEMBOLSO', 'OTRO',
    ];

    /** Lista los documentos de un cliente (metadatos, sin el binario). */
    public function index(Request $request, int $cliente)
    {
        $this->autorizarCliente($request, $cliente);

        $docs = DB::table('documentos')
            ->leftJoin('usuarios', 'usuarios.id', '=', 'documentos.subido_por')
            ->where('documentos.cliente_id', $cliente)
            ->orderByDesc('documentos.created_at')
            ->get([
                'documentos.id', 'documentos.categoria', 'documentos.nombre_original',
                'documentos.mime', 'documentos.tamano_bytes', 'documentos.created_at',
                'usuarios.nombre as subido_por',
            ]);

        return response()->json(['data' => $docs]);
    }

    /** Devuelve el contenido del documento (base64) para visualizar o descargar. */
    public function show(Request $request, int $cliente, int $documento)
    {
        $this->autorizarCliente($request, $cliente);

        $doc = DB::table('documentos')->where('id', $documento)->where('cliente_id', $cliente)->first();
        abort_unless($doc, 404, 'Documento no encontrado.');

        return response()->json(['data' => [
            'id'              => $doc->id,
            'categoria'       => $doc->categoria,
            'nombre_original' => $doc->nombre_original,
            'mime'            => $doc->mime,
            'contenido_base64'=> $doc->contenido_base64,
        ]]);
    }

    /** Sube un documento nuevo para el cliente. */
    public function store(Request $request, int $cliente)
    {
        $this->autorizarCliente($request, $cliente);

        $data = $request->validate([
            'categoria'        => ['required', 'in:'.implode(',', self::CATEGORIAS)],
            'nombre_original'  => ['required', 'string', 'max:255'],
            'mime'             => ['required', 'string', 'max:100'],
            'contenido_base64' => ['required', 'string'],
        ]);

        $id = DB::table('documentos')->insertGetId([
            'cliente_id'       => $cliente,
            'categoria'        => $data['categoria'],
            's3_key'           => null,
            'nombre_original'  => $data['nombre_original'],
            'mime'             => $data['mime'],
            'tamano_bytes'     => (int) (strlen($data['contenido_base64']) * 0.75),
            'contenido_base64' => $data['contenido_base64'],
            'subido_por'       => $request->user()->id,
            'created_at'       => now(),
        ]);

        $this->auditar($request, 'CREATE', $id, ['categoria' => $data['categoria'], 'nombre' => $data['nombre_original']]);

        return response()->json(['message' => 'Documento cargado.', 'id' => $id], 201);
    }

    /**
     * Reemplaza un documento existente por uno nuevo.
     * El archivo anterior se elimina físicamente (se sobrescribe el base64)
     * y queda registro en auditoría del reemplazo.
     */
    public function replace(Request $request, int $cliente, int $documento)
    {
        $this->autorizarCliente($request, $cliente);

        $data = $request->validate([
            'nombre_original'  => ['required', 'string', 'max:255'],
            'mime'             => ['required', 'string', 'max:100'],
            'contenido_base64' => ['required', 'string'],
        ]);

        $doc = DB::table('documentos')->where('id', $documento)->where('cliente_id', $cliente)->first();
        abort_unless($doc, 404, 'Documento no encontrado.');

        // Sobrescribir = eliminar físicamente el contenido anterior
        DB::table('documentos')->where('id', $documento)->update([
            'nombre_original'  => $data['nombre_original'],
            'mime'             => $data['mime'],
            'tamano_bytes'     => (int) (strlen($data['contenido_base64']) * 0.75),
            'contenido_base64' => $data['contenido_base64'],
            'subido_por'       => $request->user()->id,
        ]);

        $this->auditar($request, 'REPLACE', $documento, [
            'accion'         => 'Documento reemplazado',
            'nombre_anterior'=> $doc->nombre_original,
            'nombre_nuevo'   => $data['nombre_original'],
        ], ['nombre_original' => $doc->nombre_original]);

        return response()->json(['message' => 'Documento reemplazado. El anterior fue eliminado.']);
    }

    /** Elimina físicamente un documento y registra la auditoría. */
    public function destroy(Request $request, int $cliente, int $documento)
    {
        $this->autorizarCliente($request, $cliente);

        $doc = DB::table('documentos')->where('id', $documento)->where('cliente_id', $cliente)->first();
        abort_unless($doc, 404, 'Documento no encontrado.');

        DB::table('documentos')->where('id', $documento)->delete();

        $this->auditar($request, 'DELETE', $documento, [
            'accion'    => 'Documento eliminado',
            'categoria' => $doc->categoria,
            'nombre'    => $doc->nombre_original,
        ], ['nombre_original' => $doc->nombre_original, 'categoria' => $doc->categoria]);

        return response()->json(['message' => 'Documento eliminado.']);
    }

    /** Autoriza según la política de ver/gestionar el cliente. */
    private function autorizarCliente(Request $request, int $clienteId): void
    {
        $cliente = \App\Models\Cliente::findOrFail($clienteId);
        abort_if($request->user()->cannot('view', $cliente), 403, 'No autorizado sobre este cliente.');
    }

    /** Registro de auditoría con usuario, fecha y hora (created_at). */
    private function auditar(Request $request, string $accion, int $docId, array $nuevos, array $anteriores = []): void
    {
        DB::table('auditoria')->insert([
            'usuario_id'       => $request->user()->id,
            'accion'           => $accion,
            'entidad'          => 'documentos',
            'entidad_id'       => $docId,
            'datos_anteriores' => $anteriores ? json_encode($anteriores) : null,
            'datos_nuevos'     => json_encode($nuevos),
            'ip'               => $request->ip(),
            'user_agent'       => $request->userAgent(),
            'created_at'       => now(),
        ]);
    }
}

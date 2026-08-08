<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * NUMERACIÓN INDEPENDIENTE POR EMPRESA.
 *
 * Cada empresa lleva sus propias series: dos empresas distintas pueden tener a la
 * vez su crédito CR-000001 sin colisionar, igual que dos negocios reales numeran
 * sus facturas desde uno.
 *
 * La reserva del número se hace con un bloqueo de fila (`FOR UPDATE`): si dos
 * usuarios de la misma empresa desembolsan en el mismo instante, uno espera al
 * otro y cada crédito recibe un número distinto. Sin ese bloqueo, ambos leerían
 * el mismo "siguiente" y emitirían números repetidos.
 */
class ConsecutivoService
{
    /**
     * Reserva y devuelve el próximo número de una serie.
     * Debe invocarse dentro de una transacción para que el bloqueo tenga efecto.
     */
    public function siguiente(string $tipo, ?int $empresaId = null): string
    {
        $empresaId = $empresaId ?? ContextoEmpresa::idParaEscritura();

        $fila = DB::table('consecutivos')
            ->where('empresa_id', $empresaId)->where('tipo', $tipo)
            ->lockForUpdate()
            ->first();

        // Serie no configurada: se crea al vuelo con valores razonables.
        if (! $fila) {
            DB::table('consecutivos')->insert([
                'empresa_id' => $empresaId, 'tipo' => $tipo,
                'prefijo' => strtoupper(substr($tipo, 0, 2)) . '-',
                'siguiente' => 2, 'longitud' => 6, 'updated_at' => now(),
            ]);
            return strtoupper(substr($tipo, 0, 2)) . '-' . str_pad('1', 6, '0', STR_PAD_LEFT);
        }

        $numero = (int) $fila->siguiente;

        DB::table('consecutivos')
            ->where('empresa_id', $empresaId)->where('tipo', $tipo)
            ->update(['siguiente' => $numero + 1, 'updated_at' => now()]);

        return $fila->prefijo . str_pad((string) $numero, (int) $fila->longitud, '0', STR_PAD_LEFT);
    }

    /** Configuración de las series de una empresa (para mostrarlas y ajustarlas). */
    public function series(?int $empresaId = null): array
    {
        $empresaId = $empresaId ?? ContextoEmpresa::id();
        if (! $empresaId) return [];

        return DB::table('consecutivos')->where('empresa_id', $empresaId)
            ->orderBy('tipo')->get(['tipo', 'prefijo', 'siguiente', 'longitud'])->toArray();
    }
}

<?php

namespace App\Services;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * AperturaCajaService — control del estado de la caja individual.
 *
 * Punto único que responde: ¿la caja de este empleado está ABIERTA hoy?
 * Gobierna la apertura manual (elimina la apertura automática) y sirve de
 * guardia para bloquear cobros, desembolsos y gastos si no hay caja abierta.
 */
class AperturaCajaService
{
    /** Devuelve la apertura del empleado para la fecha (o null si no ha abierto). */
    public function aperturaDe(int $empleadoId, ?string $fecha = null): ?object
    {
        $fecha = $fecha ?: now()->toDateString();
        return DB::table('aperturas_caja')
            ->where('empleado_id', $empleadoId)
            ->whereDate('fecha', $fecha)
            ->first();
    }

    /** ¿La caja del empleado está ABIERTA hoy? */
    public function estaAbierta(int $empleadoId, ?string $fecha = null): bool
    {
        $a = $this->aperturaDe($empleadoId, $fecha);
        return $a !== null && $a->estado === 'ABIERTA';
    }

    /**
     * Guardia de operación: exige caja ABIERTA o corta con 409.
     * Se invoca antes de registrar cobros, desembolsos y gastos.
     */
    public function exigirAbierta(int $empleadoId): void
    {
        $a = $this->aperturaDe($empleadoId);
        if ($a === null) {
            abort(409, 'Debes ABRIR la caja antes de registrar operaciones del día.');
        }
        if ($a->estado === 'CERRADA') {
            abort(409, 'La caja del día ya fue cerrada. No es posible registrar más operaciones.');
        }
    }

    /** Abre la caja del día (acto manual y explícito). Una apertura por empleado y día. */
    public function abrir(Request $request, float $baseInicial, ?string $observacion): object
    {
        $empleadoId = $request->user()->id;
        $fecha = now()->toDateString();

        $existente = $this->aperturaDe($empleadoId, $fecha);
        if ($existente) {
            if ($existente->estado === 'ABIERTA') {
                abort(422, 'La caja ya está abierta.');
            }
            abort(422, 'La caja de hoy ya fue cerrada y no puede reabrirse. Contacta al administrador si necesitas una excepción.');
        }

        $id = DB::transaction(function () use ($request, $empleadoId, $fecha, $baseInicial, $observacion) {
            $id = DB::table('aperturas_caja')->insertGetId([
                'empleado_id'          => $empleadoId,
                'fecha'                => $fecha,
                'estado'               => 'ABIERTA',
                'base_inicial'         => $baseInicial,
                'observacion_apertura' => $observacion,
                'abierta_at'           => now(),
                'ip'                   => $request->ip(),
                'user_agent'           => $request->userAgent(),
                'created_at'           => now(),
            ]);

            // La base inicial se registra como movimiento de caja (fuente única del efectivo),
            // igual que antes, para que estadoDia la contabilice sin cambios.
            // NOTA: movimientos_caja NO tiene columna updated_at; solo created_at.
            if ($baseInicial > 0) {
                $areaId = DB::table('usuario_area')->where('usuario_id', $empleadoId)->value('area_id');
                DB::table('movimientos_caja')->insert([
                    'tipo'            => 'INGRESO',
                    'valor'           => $baseInicial,
                    'medio_pago'      => 'EFECTIVO',
                    'referencia_tipo' => 'BASE_INICIAL',
                    'concepto'        => 'Base inicial',
                    'observacion'     => $observacion,
                    'area_id'         => $areaId,
                    'registrado_por'  => $empleadoId,
                    'fecha'           => $fecha,
                    'created_at'      => now(),
                ]);
            }

            // Auditoría
            DB::table('auditoria')->insert([
                'usuario_id'   => $empleadoId,
                'accion'       => 'CAJA_ABIERTA',
                'entidad'      => 'apertura_caja',
                'entidad_id'   => $id,
                'datos_nuevos' => json_encode(['base_inicial' => $baseInicial], JSON_UNESCAPED_UNICODE),
                'ip'           => $request->ip(),
                'user_agent'   => $request->userAgent(),
                'created_at'   => now(),
            ]);

            return $id;
        });

        return DB::table('aperturas_caja')->where('id', $id)->first();
    }

    /** Marca la apertura como CERRADA (invocado por el cierre de caja). */
    public function marcarCerrada(int $empleadoId, ?string $fecha, ?int $cierreCajaId): void
    {
        $fecha = $fecha ?: now()->toDateString();
        DB::table('aperturas_caja')
            ->where('empleado_id', $empleadoId)
            ->whereDate('fecha', $fecha)
            ->update(['estado' => 'CERRADA', 'cerrada_at' => now(), 'cierre_caja_id' => $cierreCajaId]);
    }
}

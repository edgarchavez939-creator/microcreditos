<?php

namespace App\Services;

use App\Models\Parametro;
use App\Models\Usuario;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class OtpService
{
    /** Operaciones críticas que aceptan OTP. Escalable: añadir aquí nuevas operaciones. */
    public const OPERACIONES = [
        'ANULAR_PAGO'      => 'Anular un pago',
        'ANULAR_DESEMBOLSO'=> 'Anular un desembolso',
        'ELIMINAR_CREDITO' => 'Eliminar un crédito',
    ];

    /**
     * Genera un código de un solo uso para el usuario y la operación.
     * Invalida cualquier código previo sin usar de la misma operación.
     * El "canal de entrega" actual es en pantalla; la estructura permite
     * conectar correo/SMS/WhatsApp en el futuro sin cambiar este flujo.
     */
    public function generar(Usuario $usuario, string $operacion): array
    {
        abort_unless(array_key_exists($operacion, self::OPERACIONES), 422, 'Operación no válida.');

        // Invalidar códigos previos sin usar de esta operación
        DB::table('otp_codigos')
            ->where('usuario_id', $usuario->id)
            ->where('operacion', $operacion)
            ->whereNull('usado_at')
            ->update(['usado_at' => now()]);

        $codigo   = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $vigencia = (int) Parametro::valor('otp.vigencia_minutos', 5);
        $expira   = now()->addMinutes(max($vigencia, 1));

        DB::table('otp_codigos')->insert([
            'usuario_id'  => $usuario->id,
            'operacion'   => $operacion,
            'codigo_hash' => Hash::make($codigo),
            'expira_at'   => $expira,
            'created_at'  => now(),
        ]);

        $this->auditar($usuario, $operacion, 'OTP_GENERADO', $codigo);

        return [
            'codigo'           => $codigo, // entrega en pantalla (canal actual)
            'expira_at'        => $expira->toIso8601String(),
            'vigencia_minutos' => max($vigencia, 1),
            'operacion'        => $operacion,
        ];
    }

    /**
     * Consume el código: válido solo si no se ha usado, no ha expirado y coincide.
     * Registra en auditoría el resultado (aprobado o rechazado) sin exponer el código completo.
     */
    public function consumir(Usuario $usuario, string $operacion, string $codigo): bool
    {
        $fila = DB::table('otp_codigos')
            ->where('usuario_id', $usuario->id)
            ->where('operacion', $operacion)
            ->whereNull('usado_at')
            ->where('expira_at', '>', now())
            ->orderByDesc('id')
            ->first();

        $valido = $fila && Hash::check($codigo, $fila->codigo_hash);

        if ($valido) {
            DB::table('otp_codigos')->where('id', $fila->id)->update(['usado_at' => now()]);
        }

        $this->auditar($usuario, $operacion, $valido ? 'OTP_APROBADO' : 'OTP_RECHAZADO', $codigo);

        return $valido;
    }

    /** Auditoría del evento OTP: usuario, fecha/hora, operación y resultado. El código se enmascara. */
    private function auditar(Usuario $usuario, string $operacion, string $resultado, string $codigo): void
    {
        DB::table('auditoria')->insert([
            'usuario_id'   => $usuario->id,
            'accion'       => $resultado,
            'entidad'      => 'OTP',
            'entidad_id'   => null,
            'datos_nuevos' => json_encode([
                'operacion'      => $operacion,
                'codigo_parcial' => '••••'.substr($codigo, -2),
            ]),
            'ip'         => request()?->ip(),
            'user_agent' => request()?->userAgent(),
            'created_at' => now(),
        ]);
    }
}

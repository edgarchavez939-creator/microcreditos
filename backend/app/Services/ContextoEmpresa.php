<?php

namespace App\Services;

use App\Models\Usuario;
use Illuminate\Support\Facades\DB;

/**
 * CONTEXTO DE EMPRESA (Tenant).
 *
 * Declara ante PostgreSQL a qué empresa pertenece la petición en curso. A partir
 * de esa declaración, las políticas de la base de datos restringen cada consulta
 * a esa empresa —lea o escriba, use Eloquent o SQL crudo, filtre o no filtre—.
 *
 * NOTA SOBRE EL AGRUPADOR DE CONEXIONES (pooler):
 * la variable se fija a nivel de SESIÓN. Con un agrupador en modo transacción
 * (el endpoint "-pooler" de Neon) una misma conexión física puede repartirse
 * entre peticiones distintas y el contexto podría filtrarse a otra empresa.
 * Por eso el backend debe conectarse al endpoint DIRECTO de Neon. La verificación
 * `confirmar()` detecta el problema en caliente en lugar de dejarlo pasar.
 */
class ContextoEmpresa
{
    private static ?int $empresaId = null;
    private static bool $global = false;

    /** Establece la empresa de la petición a partir del usuario autenticado. */
    public static function establecerDesde(?Usuario $u): void
    {
        if (! $u) { self::limpiar(); return; }

        // El Administrador Funcional Global no pertenece a ninguna empresa:
        // opera sobre la plataforma, no sobre la operación de un cliente.
        if ($u->esAdminGlobal()) {
            self::$global = true;
            self::$empresaId = $u->empresa_soporte_id ? (int) $u->empresa_soporte_id : null;

            // En Modo Soporte sí se fija el contexto de la empresa visitada.
            if (self::$empresaId) {
                self::aplicar(self::$empresaId);
            } else {
                self::limpiar();
            }
            return;
        }

        $id = (int) ($u->empresa_id ?? 0);
        abort_if($id <= 0, 403, 'Tu usuario no está asociado a ninguna empresa. Contacta al administrador.');

        self::$global = false;
        self::$empresaId = $id;
        self::aplicar($id);
    }

    /** Fija la variable de sesión que leen las políticas de la base de datos. */
    private static function aplicar(int $empresaId): void
    {
        // set_config con parámetro: evita cualquier riesgo de inyección al
        // construir el SET con concatenación de cadenas.
        DB::statement("SELECT set_config('app.empresa_id', ?, false)", [(string) $empresaId]);
    }

    /**
     * Comprueba que la base de datos está viendo la empresa correcta.
     * Si no coincide, la petición se detiene: es preferible un error visible a
     * servir —o peor, escribir— datos de otra empresa.
     */
    public static function confirmar(): void
    {
        if (self::$empresaId === null) return;

        $actual = DB::selectOne("SELECT NULLIF(current_setting('app.empresa_id', true), '') AS v")?->v;
        if ((int) $actual !== self::$empresaId) {
            \Illuminate\Support\Facades\Log::critical('Contexto de empresa perdido o alterado.', [
                'esperado' => self::$empresaId, 'obtenido' => $actual,
            ]);
            abort(500, 'No se pudo establecer el contexto de la empresa. Intenta de nuevo.');
        }
    }

    public static function limpiar(): void
    {
        self::$empresaId = null;
        self::$global = false;
        DB::statement("SELECT set_config('app.empresa_id', '', false)");
    }

    public static function id(): ?int { return self::$empresaId; }
    public static function esGlobal(): bool { return self::$global; }

    /** Identificador que deben grabar los registros nuevos. */
    public static function idParaEscritura(): int
    {
        $id = self::$empresaId;
        abort_if($id === null, 409, 'No hay una empresa activa en esta sesión.');
        return $id;
    }
}

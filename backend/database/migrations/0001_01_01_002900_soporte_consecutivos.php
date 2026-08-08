<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * FASE 3 · OPERACIÓN SaaS.
 *
 *   sesiones_soporte  · registro de cada entrada del Administrador Global a una
 *                       empresa: quién, cuándo, por qué y durante cuánto tiempo.
 *                       Sin este rastro, un acceso técnico sería indistinguible
 *                       de una intrusión.
 *   consecutivos      · numeración independiente por empresa. Dos empresas deben
 *                       poder tener su crédito CR-000001 sin colisionar.
 */
return new class extends Migration
{
    public function up(): void
    {
        // ---------- Modo Soporte ----------
        DB::statement("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS empresa_soporte_id BIGINT REFERENCES empresas(id)");
        DB::statement("COMMENT ON COLUMN usuarios.empresa_soporte_id IS 'Empresa que el Administrador Global está visitando en Modo Soporte'");

        DB::statement("
            CREATE TABLE IF NOT EXISTS sesiones_soporte (
                id BIGSERIAL PRIMARY KEY,
                empresa_id BIGINT NOT NULL REFERENCES empresas(id),
                usuario_global_id BIGINT NOT NULL REFERENCES usuarios(id),
                motivo TEXT NOT NULL,
                iniciada_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                finalizada_at TIMESTAMPTZ,
                minutos INTEGER,
                acciones INTEGER NOT NULL DEFAULT 0,
                ip VARCHAR(60),
                user_agent VARCHAR(255)
            )
        ");
        DB::statement('CREATE INDEX IF NOT EXISTS idx_soporte_empresa ON sesiones_soporte(empresa_id, iniciada_at)');
        DB::statement('CREATE INDEX IF NOT EXISTS idx_soporte_abierta ON sesiones_soporte(usuario_global_id) WHERE finalizada_at IS NULL');

        // Marca en auditoría: distingue lo hecho en soporte de la operación normal
        DB::statement("ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS sesion_soporte_id BIGINT");

        // ---------- Numeración independiente por empresa ----------
        DB::statement("
            CREATE TABLE IF NOT EXISTS consecutivos (
                id BIGSERIAL PRIMARY KEY,
                empresa_id BIGINT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
                tipo VARCHAR(40) NOT NULL,          -- CREDITO|CLIENTE|SOLICITUD|PAGO|RECIBO|CIERRE
                prefijo VARCHAR(12) NOT NULL DEFAULT '',
                siguiente BIGINT NOT NULL DEFAULT 1,
                longitud SMALLINT NOT NULL DEFAULT 6,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                UNIQUE (empresa_id, tipo)
            )
        ");

        // Cada empresa arranca con sus series. La Empresa 1 continúa donde iba
        // para no repetir números ya emitidos.
        foreach (DB::table('empresas')->pluck('id') as $empresaId) {
            $series = [
                ['CREDITO',   'CR-'],
                ['CLIENTE',   'CL-'],
                ['SOLICITUD', 'SO-'],
                ['PAGO',      'PG-'],
                ['RECIBO',    'RC-'],
                ['CIERRE',    'CC-'],
            ];
            foreach ($series as [$tipo, $prefijo]) {
                $siguiente = 1;
                if ($tipo === 'CREDITO') {
                    // Continuar la numeración existente de esta empresa
                    $max = DB::table('solicitudes')
                        ->where('empresa_id', $empresaId)
                        ->whereNotNull('numero_credito')
                        ->selectRaw("MAX(NULLIF(regexp_replace(numero_credito, '[^0-9]', '', 'g'), '')::bigint) as m")
                        ->value('m');
                    $siguiente = ((int) $max) + 1;
                }
                DB::table('consecutivos')->updateOrInsert(
                    ['empresa_id' => $empresaId, 'tipo' => $tipo],
                    ['prefijo' => $prefijo, 'siguiente' => max($siguiente, 1), 'longitud' => 6, 'updated_at' => now()]
                );
            }
        }
    }

    public function down(): void
    {
        DB::statement('DROP TABLE IF EXISTS consecutivos');
        DB::statement('ALTER TABLE auditoria DROP COLUMN IF EXISTS sesion_soporte_id');
        DB::statement('DROP TABLE IF EXISTS sesiones_soporte');
        DB::statement('ALTER TABLE usuarios DROP COLUMN IF EXISTS empresa_soporte_id');
    }
};

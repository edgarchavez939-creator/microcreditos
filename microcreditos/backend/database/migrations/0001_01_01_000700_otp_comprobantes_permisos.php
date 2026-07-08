<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // 1) Códigos OTP de un solo uso para operaciones críticas
        DB::statement("
            CREATE TABLE IF NOT EXISTS otp_codigos (
                id          BIGSERIAL PRIMARY KEY,
                usuario_id  BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                operacion   VARCHAR(60) NOT NULL,
                codigo_hash VARCHAR(255) NOT NULL,
                expira_at   TIMESTAMPTZ NOT NULL,
                usado_at    TIMESTAMPTZ,
                created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        ");
        DB::statement("CREATE INDEX IF NOT EXISTS idx_otp_usuario_op ON otp_codigos(usuario_id, operacion)");

        // 2) Comprobantes: vínculo directo al pago y a la transferencia (la evidencia nunca se pierde)
        DB::statement("ALTER TABLE documentos ADD COLUMN IF NOT EXISTS pago_id BIGINT");
        DB::statement("ALTER TABLE documentos ADD COLUMN IF NOT EXISTS transferencia_id BIGINT");
        DB::statement("CREATE INDEX IF NOT EXISTS idx_documentos_transferencia ON documentos(transferencia_id)");

        // 3) Permisos dinámicos por módulo (regla por rol o por usuario específico)
        DB::statement("
            CREATE TABLE IF NOT EXISTS permisos (
                id         BIGSERIAL PRIMARY KEY,
                modulo     VARCHAR(60) NOT NULL,
                rol        VARCHAR(30),
                usuario_id BIGINT REFERENCES usuarios(id) ON DELETE CASCADE,
                permitido  BOOLEAN NOT NULL DEFAULT TRUE,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                CONSTRAINT chk_permiso_destino CHECK (rol IS NOT NULL OR usuario_id IS NOT NULL)
            )
        ");
        DB::statement("CREATE UNIQUE INDEX IF NOT EXISTS uq_permiso_rol ON permisos(modulo, rol) WHERE usuario_id IS NULL");
        DB::statement("CREATE UNIQUE INDEX IF NOT EXISTS uq_permiso_usuario ON permisos(modulo, usuario_id) WHERE rol IS NULL");
    }

    public function down(): void
    {
        DB::statement("DROP TABLE IF EXISTS otp_codigos");
        DB::statement("DROP TABLE IF EXISTS permisos");
        DB::statement("ALTER TABLE documentos DROP COLUMN IF EXISTS pago_id");
        DB::statement("ALTER TABLE documentos DROP COLUMN IF EXISTS transferencia_id");
    }
};

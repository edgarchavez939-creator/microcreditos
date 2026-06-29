<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Permite guardar el contenido del soporte directamente en la BD (base64)
 * mientras no haya almacenamiento de objetos (S3) configurado.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE documentos ADD COLUMN IF NOT EXISTS contenido_base64 TEXT");
        DB::statement("ALTER TABLE documentos ALTER COLUMN s3_key DROP NOT NULL");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE documentos DROP COLUMN IF EXISTS contenido_base64");
    }
};

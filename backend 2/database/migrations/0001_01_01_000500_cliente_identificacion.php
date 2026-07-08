<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Aditiva e idempotente: nuevos campos de identificación del cliente
        DB::statement("ALTER TABLE clientes ADD COLUMN IF NOT EXISTS fecha_expedicion_documento DATE");
        DB::statement("ALTER TABLE clientes ADD COLUMN IF NOT EXISTS lugar_expedicion_documento VARCHAR(150)");
        DB::statement("ALTER TABLE clientes ADD COLUMN IF NOT EXISTS lugar_nacimiento VARCHAR(150)");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE clientes DROP COLUMN IF EXISTS fecha_expedicion_documento");
        DB::statement("ALTER TABLE clientes DROP COLUMN IF EXISTS lugar_expedicion_documento");
        DB::statement("ALTER TABLE clientes DROP COLUMN IF EXISTS lugar_nacimiento");
    }
};

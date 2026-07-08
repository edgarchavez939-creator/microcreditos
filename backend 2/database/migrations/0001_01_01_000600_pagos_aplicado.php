<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Los pagos por transferencia quedan "no aplicados" hasta ser aprobados.
        DB::statement("ALTER TABLE pagos ADD COLUMN IF NOT EXISTS aplicado BOOLEAN NOT NULL DEFAULT TRUE");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE pagos DROP COLUMN IF EXISTS aplicado");
    }
};

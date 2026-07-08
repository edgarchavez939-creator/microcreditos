<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Crea todo el esquema de dominio ejecutando database/schema.sql,
 * manteniendo ese archivo como única fuente de verdad (sin duplicar DDL).
 */
return new class extends Migration
{
    public function up(): void
    {
        $sql = file_get_contents(database_path('schema.sql'));
        DB::unprepared($sql);
    }

    public function down(): void
    {
        // Orden inverso por dependencias de FK
        $tablas = [
            'transferencia_comprobantes','transferencias','pagos','cuotas','desembolsos',
            'documentos','referencias','gestiones_mora','visitas','movimientos_caja',
            'cierres_caja','solicitudes','productos','clientes','limites_aprobacion',
            'parametros','refresh_tokens','usuario_area','usuarios','areas','auditoria',
        ];
        foreach ($tablas as $t) {
            DB::statement("DROP TABLE IF EXISTS {$t} CASCADE");
        }
        foreach ([
            'rol_usuario','tipo_documento','genero','estado_civil','modalidad_pago','tipo_interes',
            'estado_solicitud','estado_cuota','metodo_pago','estado_transfer','tipo_gestion_mora',
            'tipo_movimiento','categoria_documento',
        ] as $tipo) {
            DB::statement("DROP TYPE IF EXISTS {$tipo} CASCADE");
        }
    }
};

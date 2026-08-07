<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * FASE 1 · CIMIENTOS MULTI-EMPRESA (Multi-Tenant).
 *
 * Convierte la plataforma de mono-empresa a multi-empresa SIN tocar la lógica de
 * negocio ni perder un solo registro:
 *
 *   1. Crea la tabla `empresas`.
 *   2. Registra la operación actual como Empresa 1.
 *   3. Añade `empresa_id` a las tablas de negocio y asigna todo a la Empresa 1.
 *   4. Activa el aislamiento en la propia base de datos (Row-Level Security).
 *
 * POR QUÉ EL AISLAMIENTO VA EN LA BASE DE DATOS Y NO EN EL CÓDIGO:
 * el sistema tiene ~394 puntos de consulta. Confiar el aislamiento a que ninguno
 * olvide el filtro es una apuesta perdida de antemano, y el precio de perderla es
 * que una empresa vea la cartera de otra. Con RLS el motor aplica el filtro
 * siempre, incluso si una consulta lo omite.
 *
 * Es una migración ADITIVA: no borra ni modifica datos existentes.
 */
return new class extends Migration
{
    /**
     * Tablas de negocio: cada registro pertenece a una empresa.
     * Se incluyen también las tablas hijas (cuotas, pagos…) aunque podrían deducir
     * su empresa desde el padre: cada tabla necesita su propia política y deducirla
     * por relación sería frágil y costoso en cada consulta.
     */
    public const TABLAS_TENANT = [
        // Núcleo
        'areas', 'usuarios', 'usuario_area', 'clientes', 'referencias',
        'solicitudes', 'cuotas', 'pagos', 'desembolsos', 'renovaciones',
        'productos', 'productos_financieros', 'producto_versiones',
        // Caja y tesorería
        'aperturas_caja', 'cierres_caja', 'cierres_generales', 'movimientos_caja',
        'transferencias', 'transferencia_comprobantes',
        // Cobranza y territorio
        'gestiones_mora', 'visitas', 'ubicaciones_empleado', 'historial_area_cliente',
        // Empleados
        'obligaciones_empleado', 'movimientos_empleado',
        // Configuración y gobierno por empresa
        'parametros', 'permisos', 'limites_aprobacion', 'licencia',
        'feature_flags', 'marca_activos', 'documentos', 'auditoria',
        // Migración de cartera
        'migraciones', 'migracion_plantillas', 'migracion_registros',
    ];

    /**
     * Tablas globales de plataforma: NO llevan empresa.
     *   versiones / mantenimiento → estado del software, común a todos.
     *   refresh_tokens / otp_codigos → ligados al usuario, que ya tiene empresa.
     */
    public const TABLAS_GLOBALES = ['versiones', 'mantenimiento', 'refresh_tokens', 'otp_codigos'];

    public function up(): void
    {
        // ---------- 1. Tabla de empresas ----------
        DB::statement("
            CREATE TABLE IF NOT EXISTS empresas (
                id BIGSERIAL PRIMARY KEY,
                nombre VARCHAR(160) NOT NULL,
                razon_social VARCHAR(200),
                nit VARCHAR(40),
                estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVA',   -- ACTIVA|SUSPENDIDA|PRUEBA|INACTIVA
                -- Localización
                moneda VARCHAR(8) NOT NULL DEFAULT 'COP',
                simbolo_moneda VARCHAR(6) NOT NULL DEFAULT '$',
                zona_horaria VARCHAR(60) NOT NULL DEFAULT 'America/Bogota',
                idioma VARCHAR(8) NOT NULL DEFAULT 'es',
                formato_fecha VARCHAR(20) NOT NULL DEFAULT 'd/m/Y',
                -- Contacto y datos comerciales
                direccion VARCHAR(200),
                ciudad VARCHAR(100),
                telefono VARCHAR(40),
                email VARCHAR(160),
                sitio_web VARCHAR(160),
                -- Ciclo de vida
                suspendida_at TIMESTAMPTZ,
                motivo_suspension TEXT,
                creada_por BIGINT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        ");

        // ---------- 2. La operación actual pasa a ser la Empresa 1 ----------
        $existe = DB::table('empresas')->count();
        if ($existe === 0) {
            $nombre = 'Mi empresa';
            try {
                $p = DB::table('parametros')->where('clave', 'marca.nombre_plataforma')->value('valor');
                if ($p) $nombre = trim((string) json_decode($p, true) ?: $nombre);
            } catch (\Throwable) {
                // Sin parámetros aún: se queda el nombre por defecto.
            }
            DB::table('empresas')->insert([
                'id' => 1, 'nombre' => $nombre, 'estado' => 'ACTIVA',
                'created_at' => now(), 'updated_at' => now(),
            ]);
            DB::statement("SELECT setval('empresas_id_seq', GREATEST((SELECT MAX(id) FROM empresas), 1))");
        }

        // ---------- 3. empresa_id en las tablas de negocio ----------
        foreach (self::TABLAS_TENANT as $t) {
            if (! $this->existeTabla($t)) continue;

            DB::statement("ALTER TABLE {$t} ADD COLUMN IF NOT EXISTS empresa_id BIGINT");
            // Todo lo que ya existe pertenece a la Empresa 1
            DB::statement("UPDATE {$t} SET empresa_id = 1 WHERE empresa_id IS NULL");
            DB::statement("ALTER TABLE {$t} ALTER COLUMN empresa_id SET DEFAULT 1");
            DB::statement("ALTER TABLE {$t} ALTER COLUMN empresa_id SET NOT NULL");

            // Índice: toda consulta filtrará por esta columna
            DB::statement("CREATE INDEX IF NOT EXISTS idx_{$t}_empresa ON {$t}(empresa_id)");
        }

        // Clave foránea solo donde no compromete el rendimiento de escritura masiva
        foreach (['areas', 'usuarios', 'clientes', 'solicitudes', 'parametros'] as $t) {
            if (! $this->existeTabla($t)) continue;
            DB::statement("
                DO $$ BEGIN
                    ALTER TABLE {$t} ADD CONSTRAINT fk_{$t}_empresa
                        FOREIGN KEY (empresa_id) REFERENCES empresas(id);
                EXCEPTION WHEN duplicate_object THEN NULL; END $$;
            ");
        }

        // ---------- 4. Aislamiento en la base de datos ----------
        // La política deja pasar cuando NO hay contexto (migraciones, comandos de
        // consola, respaldos). Cuando la aplicación declara una empresa, el motor
        // restringe todas las filas a esa empresa, aunque la consulta no filtre.
        foreach (self::TABLAS_TENANT as $t) {
            if (! $this->existeTabla($t)) continue;

            DB::statement("ALTER TABLE {$t} ENABLE ROW LEVEL SECURITY");
            // FORCE: aplica incluso al propietario de la tabla, que es con quien
            // se conecta la aplicación. Sin esto, RLS no protegería nada.
            DB::statement("ALTER TABLE {$t} FORCE ROW LEVEL SECURITY");

            DB::statement("DROP POLICY IF EXISTS aislamiento_empresa ON {$t}");
            DB::statement("
                CREATE POLICY aislamiento_empresa ON {$t}
                USING (
                    NULLIF(current_setting('app.empresa_id', true), '') IS NULL
                    OR empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::bigint
                )
                WITH CHECK (
                    NULLIF(current_setting('app.empresa_id', true), '') IS NULL
                    OR empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::bigint
                )
            ");
        }

        // ---------- 5. Verificación del rol de conexión ----------
        // REQUISITO CRÍTICO: los roles SUPERUSUARIO y los que tienen BYPASSRLS
        // ignoran las políticas de seguridad SIEMPRE, incluso con FORCE. Si la
        // aplicación se conecta con un rol así, el aislamiento NO existe aunque
        // las políticas estén creadas. Comprobado en pruebas: con superusuario,
        // una empresa veía y escribía datos de otra sin ningún impedimento.
        $rol = DB::selectOne("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user");
        if ($rol && ($rol->rolsuper || $rol->rolbypassrls)) {
            \Illuminate\Support\Facades\Log::critical(
                'AISLAMIENTO INACTIVO: la aplicación se conecta con un rol que ignora ' .
                'las políticas de seguridad (superusuario o BYPASSRLS). Crea un rol ' .
                'de aplicación sin esos privilegios antes de dar de alta una segunda empresa.'
            );
        }

        // ---------- 6. Usuario global de plataforma ----------
        // El Administrador Funcional Global no pertenece a ninguna empresa.
        DB::statement("ALTER TABLE usuarios ALTER COLUMN empresa_id DROP NOT NULL");
        DB::statement("COMMENT ON COLUMN usuarios.empresa_id IS 'NULL = usuario global de plataforma (Administrador Funcional Global)'");
    }

    public function down(): void
    {
        foreach (self::TABLAS_TENANT as $t) {
            if (! $this->existeTabla($t)) continue;
            DB::statement("DROP POLICY IF EXISTS aislamiento_empresa ON {$t}");
            DB::statement("ALTER TABLE {$t} NO FORCE ROW LEVEL SECURITY");
            DB::statement("ALTER TABLE {$t} DISABLE ROW LEVEL SECURITY");
            DB::statement("ALTER TABLE {$t} DROP COLUMN IF EXISTS empresa_id");
        }
        DB::statement('DROP TABLE IF EXISTS empresas');
    }

    private function existeTabla(string $t): bool
    {
        return DB::selectOne(
            "SELECT 1 AS ok FROM information_schema.tables WHERE table_schema='public' AND table_name = ?",
            [$t]
        ) !== null;
    }
};

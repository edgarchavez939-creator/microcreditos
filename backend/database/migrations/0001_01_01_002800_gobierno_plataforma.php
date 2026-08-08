<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * FASE 2 · GOBIERNO DE LA PLATAFORMA.
 *
 *   catalogo_modulos  · repositorio oficial de todos los módulos del ecosistema
 *                       KRYPTA. Es GLOBAL: no pertenece a ninguna empresa.
 *   empresa_modulos   · qué módulos tiene habilitados cada empresa.
 *   empresa_flags     · funcionalidades concretas activables por empresa, sin
 *                       necesidad de desplegar código.
 *   empresa_planes    · plan contratado y sus límites (arquitectura preparada;
 *                       en esta fase no se cobra nada).
 *
 * Los módulos que hoy existen se dan de alta en el catálogo y se habilitan para
 * la Empresa 1, de modo que nada cambia para la operación actual.
 */
return new class extends Migration
{
    // Fuera de transacción: un fallo tardío no debe revertir los pasos ya
    // completados. Todas las operaciones son idempotentes y reintentables.
    public $withinTransaction = false;

    public function up(): void
    {
        // ---------- Catálogo global de módulos ----------
        DB::statement("
            CREATE TABLE IF NOT EXISTS catalogo_modulos (
                id BIGSERIAL PRIMARY KEY,
                codigo VARCHAR(60) NOT NULL UNIQUE,
                nombre VARCHAR(120) NOT NULL,
                descripcion TEXT,
                categoria VARCHAR(60) NOT NULL DEFAULT 'OPERACION',
                producto VARCHAR(60) NOT NULL DEFAULT 'KRYPTA Credit',
                version VARCHAR(20) NOT NULL DEFAULT '1.0',
                estado VARCHAR(20) NOT NULL DEFAULT 'PUBLICADO',   -- PUBLICADO|BETA|RETIRADO
                icono VARCHAR(40),
                color VARCHAR(9),
                orden INTEGER NOT NULL DEFAULT 100,
                dependencias JSONB NOT NULL DEFAULT '[]',
                requisitos TEXT,
                nucleo BOOLEAN NOT NULL DEFAULT false,   -- true = no se puede desactivar
                publicado_at DATE,
                retirado_at DATE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        ");

        // ---------- Módulos habilitados por empresa ----------
        DB::statement("
            CREATE TABLE IF NOT EXISTS empresa_modulos (
                id BIGSERIAL PRIMARY KEY,
                empresa_id BIGINT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
                modulo_codigo VARCHAR(60) NOT NULL,
                habilitado BOOLEAN NOT NULL DEFAULT true,
                habilitado_at TIMESTAMPTZ,
                habilitado_por BIGINT,
                observacion TEXT,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                UNIQUE (empresa_id, modulo_codigo)
            )
        ");
        DB::statement('CREATE INDEX IF NOT EXISTS idx_empresa_modulos ON empresa_modulos(empresa_id, habilitado)');

        // ---------- Funcionalidades por empresa (feature flags) ----------
        DB::statement("
            CREATE TABLE IF NOT EXISTS empresa_flags (
                id BIGSERIAL PRIMARY KEY,
                empresa_id BIGINT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
                clave VARCHAR(80) NOT NULL,
                activo BOOLEAN NOT NULL DEFAULT false,
                actualizado_por BIGINT,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                UNIQUE (empresa_id, clave)
            )
        ");

        // ---------- Plan y límites por empresa ----------
        DB::statement("
            CREATE TABLE IF NOT EXISTS empresa_planes (
                id BIGSERIAL PRIMARY KEY,
                empresa_id BIGINT NOT NULL UNIQUE REFERENCES empresas(id) ON DELETE CASCADE,
                plan VARCHAR(20) NOT NULL DEFAULT 'BASICO',       -- BASICO|PROFESIONAL|ENTERPRISE
                estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',     -- ACTIVO|VENCIDO|PRUEBA
                fecha_inicio DATE,
                fecha_vencimiento DATE,
                max_usuarios INTEGER,
                max_sucursales INTEGER,
                max_almacenamiento_mb INTEGER,
                restricciones JSONB NOT NULL DEFAULT '{}',
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        ");

        // ---------- Alta de los módulos existentes en el catálogo ----------
        $modulos = [
            ['inicio',          'Inicio',                'Indicadores y resumen de la jornada',            'OPERACION',      1,  true],
            ['inbox',           'Bandeja de trabajo',    'Tareas pendientes del usuario',                  'OPERACION',      2,  true],
            ['ruta',            'Ruta del día',          'Recorrido y cobros programados',                 'COBRANZA',       10, false],
            ['caja',            'Caja',                  'Apertura, movimientos y arqueo diario',          'TESORERIA',      20, false],
            ['caja-general',    'Caja general',          'Consolidación y entrega a tesorería',            'TESORERIA',      21, false],
            ['estado-cuenta',   'Estado de cuenta',      'Obligaciones internas de empleados',             'TESORERIA',      22, false],
            ['solicitud',       'Solicitudes',           'Originación de crédito',                         'CREDITO',        30, false],
            ['clientes',        'Clientes',              'Maestro de clientes y su historial',             'CREDITO',        31, true],
            ['pagos',           'Cartera y pagos',       'Registro y aplicación de pagos',                 'COBRANZA',       32, false],
            ['aprobaciones',    'Aprobaciones',          'Autorización de solicitudes',                    'CREDITO',        33, false],
            ['reamortizacion',  'Renovaciones',          'Renovación y refinanciación',                    'CREDITO',        34, false],
            ['transferencias',  'Transferencias',        'Validación de pagos por transferencia',          'TESORERIA',      35, false],
            ['mapa',            'Mapa territorial',      'Clientes y equipo en el territorio',             'COBRANZA',       40, false],
            ['reportes',        'Reportes',              'Informes exportables',                           'ANALITICA',      50, false],
            ['migracion',       'Migración de cartera',  'Importación desde otras plataformas',            'HERRAMIENTAS',   60, false],
            ['usuarios',        'Usuarios',              'Gestión del personal',                           'ADMINISTRACION', 70, true],
            ['permisos',        'Permisos',              'Matriz de accesos por rol y usuario',            'ADMINISTRACION', 71, true],
            ['parametros',      'Parámetros',            'Reglas generales del negocio',                   'ADMINISTRACION', 72, true],
            ['admin-funcional', 'Administración',        'Centro técnico de la plataforma',                'ADMINISTRACION', 90, true],
        ];

        foreach ($modulos as [$codigo, $nombre, $desc, $categoria, $orden, $nucleo]) {
            DB::table('catalogo_modulos')->updateOrInsert(
                ['codigo' => $codigo],
                [
                    'nombre' => $nombre, 'descripcion' => $desc, 'categoria' => $categoria,
                    'producto' => 'KRYPTA Credit', 'orden' => $orden, 'nucleo' => $nucleo,
                    'estado' => 'PUBLICADO', 'publicado_at' => now()->toDateString(),
                    'updated_at' => now(),
                ]
            );
        }

        // ---------- La empresa actual conserva TODO lo que ya tenía ----------
        foreach (DB::table('empresas')->pluck('id') as $empresaId) {
            foreach ($modulos as [$codigo]) {
                DB::table('empresa_modulos')->updateOrInsert(
                    ['empresa_id' => $empresaId, 'modulo_codigo' => $codigo],
                    ['habilitado' => true, 'habilitado_at' => now(), 'updated_at' => now()]
                );
            }
            DB::table('empresa_planes')->updateOrInsert(
                ['empresa_id' => $empresaId],
                ['plan' => 'ENTERPRISE', 'estado' => 'ACTIVO', 'fecha_inicio' => now()->toDateString(), 'updated_at' => now()]
            );
        }
    }

    public function down(): void
    {
        DB::statement('DROP TABLE IF EXISTS empresa_planes');
        DB::statement('DROP TABLE IF EXISTS empresa_flags');
        DB::statement('DROP TABLE IF EXISTS empresa_modulos');
        DB::statement('DROP TABLE IF EXISTS catalogo_modulos');
    }
};

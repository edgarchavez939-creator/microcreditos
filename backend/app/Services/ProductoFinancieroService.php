<?php

namespace App\Services;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * MOTOR DE PRODUCTOS FINANCIEROS — servicio central.
 *
 * Gobierna el ciclo de vida de los productos (crear, editar, activar, duplicar) con
 * versionamiento automático, y ofrece las dos operaciones que usa el resto del
 * sistema: validar una solicitud contra la configuración del producto, y calcular
 * el plan según esa configuración (no según el nombre del producto).
 */
class ProductoFinancieroService
{
    /** Campos configurables del producto (para crear/editar/duplicar). */
    public const CAMPOS = [
        'codigo', 'nombre', 'descripcion', 'activo', 'color', 'icono', 'orden',
        'usa_tasa', 'tipo_tasa', 'tasa_defecto', 'permite_modificar_tasa',
        'usa_seguro', 'seguro_defecto', 'permite_modificar_seguro',
        'usa_valor_pactado', 'permite_pagos_libres', 'permite_pagos_anticipados',
        'permite_renovacion', 'permite_refinanciacion', 'permite_reestructuracion',
        'requiere_codeudor', 'requiere_documentos',
        'capital_minimo', 'capital_maximo', 'cuotas_minimo', 'cuotas_maximo',
        'frecuencias_permitidas',
        'requiere_supervisor', 'requiere_administrador', 'aprobacion_automatica',
        'permite_desembolso_efectivo', 'permite_desembolso_transferencia',
        'recauda_seguro', 'maneja_caja', 'config_extra',
    ];

    public function obtener(int $id): object
    {
        $p = DB::table('productos_financieros')->where('id', $id)->first();
        abort_unless($p, 404, 'Producto financiero no encontrado.');
        return $p;
    }

    public function obtenerActivo(int $id): object
    {
        $p = $this->obtener($id);
        abort_unless($p->activo, 422, 'Este producto financiero está inactivo y no admite nuevas solicitudes.');
        return $p;
    }

    /** Crea un producto y su versión 1. */
    public function crear(array $datos, ?Request $request = null): int
    {
        return DB::transaction(function () use ($datos, $request) {
            $fila = $this->soloAtributos($datos) + ['created_at' => now(), 'updated_at' => now(), 'version_actual' => 1];
            $id = DB::table('productos_financieros')->insertGetId($fila);
            $this->registrarVersion($id, 1, 'Creación inicial del producto', $request);
            $this->auditar($request, 'PRODUCTO_CREADO', $id, $datos);
            return $id;
        });
    }

    /** Edita un producto generando una NUEVA versión con snapshot. */
    public function editar(int $id, array $datos, ?Request $request = null): void
    {
        DB::transaction(function () use ($id, $datos, $request) {
            $actual = $this->obtener($id);
            $cambios = $this->describirCambios((array) $actual, $datos);
            $nuevaVersion = (int) $actual->version_actual + 1;

            DB::table('productos_financieros')->where('id', $id)->update(
                $this->soloAtributos($datos) + ['version_actual' => $nuevaVersion, 'updated_at' => now()]
            );
            $this->registrarVersion($id, $nuevaVersion, $cambios ?: 'Modificación de configuración', $request);
            $this->auditar($request, 'PRODUCTO_MODIFICADO', $id, ['version' => $nuevaVersion, 'cambios' => $cambios]);
        });
    }

    /** Activa o desactiva (los inactivos no admiten solicitudes nuevas, pero se conservan). */
    public function activar(int $id, bool $activo, ?Request $request = null): void
    {
        DB::table('productos_financieros')->where('id', $id)->update(['activo' => $activo, 'updated_at' => now()]);
        $this->auditar($request, $activo ? 'PRODUCTO_ACTIVADO' : 'PRODUCTO_DESACTIVADO', $id, []);
    }

    /** Duplica un producto (nuevo código, inactivo por defecto para revisarlo antes de usar). */
    public function duplicar(int $id, string $nuevoCodigo, string $nuevoNombre, ?Request $request = null): int
    {
        $base = (array) $this->obtener($id);
        unset($base['id'], $base['created_at'], $base['updated_at'], $base['version_actual']);
        $base['codigo'] = $nuevoCodigo;
        $base['nombre'] = $nuevoNombre;
        $base['activo'] = false;
        return $this->crear($base, $request);
    }

    /**
     * VALIDACIÓN POR CONFIGURACIÓN: revisa una solicitud contra el producto.
     * Devuelve los valores normalizados (tasa/seguro efectivos según la config).
     */
    public function validarSolicitud(object $p, array $d): array
    {
        $capital = (float) ($d['capital_solicitado'] ?? 0);
        $cuotas  = (int) ($d['numero_cuotas'] ?? 0);
        $modalidad = $d['modalidad'] ?? null;

        abort_if($capital < (float) $p->capital_minimo, 422,
            "El capital mínimo para {$p->nombre} es " . number_format((float) $p->capital_minimo, 0, ',', '.') . ' pesos.');
        abort_if($capital > (float) $p->capital_maximo, 422,
            "El capital máximo para {$p->nombre} es " . number_format((float) $p->capital_maximo, 0, ',', '.') . ' pesos.');
        abort_if($cuotas < (int) $p->cuotas_minimo || $cuotas > (int) $p->cuotas_maximo, 422,
            "El número de cuotas para {$p->nombre} debe estar entre {$p->cuotas_minimo} y {$p->cuotas_maximo}.");

        $frecuencias = json_decode($p->frecuencias_permitidas ?? '[]', true) ?: [];
        abort_if($modalidad && ! in_array($modalidad, $frecuencias, true), 422,
            "La frecuencia {$modalidad} no está permitida para {$p->nombre}.");

        // Tasa: si el producto no la usa, es 0; si no permite modificarla, se fija la del producto.
        $tasa = 0.0;
        if ($p->usa_tasa) {
            $tasa = $p->permite_modificar_tasa && isset($d['tasa_interes'])
                ? (float) $d['tasa_interes'] : (float) $p->tasa_defecto;
        }

        // Seguro: misma regla.
        $seguro = 0.0;
        if ($p->usa_seguro) {
            $seguro = $p->permite_modificar_seguro && isset($d['porcentaje_seguro'])
                ? (float) $d['porcentaje_seguro'] : (float) $p->seguro_defecto;
        }

        // Valor pactado: obligatorio si el producto lo maneja; debe superar el capital.
        $valorPactado = null;
        if ($p->usa_valor_pactado) {
            $valorPactado = (float) ($d['valor_pactado'] ?? 0);
            abort_if($valorPactado <= 0, 422, "{$p->nombre} requiere el valor total pactado.");
            abort_if($valorPactado < $capital, 422, 'El valor pactado no puede ser menor que el capital entregado.');
        }

        return ['tasa_interes' => $tasa, 'porcentaje_seguro' => $seguro, 'valor_pactado' => $valorPactado];
    }

    // ---------- internos ----------

    private function soloAtributos(array $datos): array
    {
        $fila = array_intersect_key($datos, array_flip(self::CAMPOS));
        if (isset($fila['frecuencias_permitidas']) && is_array($fila['frecuencias_permitidas'])) {
            $fila['frecuencias_permitidas'] = json_encode($fila['frecuencias_permitidas']);
        }
        if (isset($fila['config_extra']) && is_array($fila['config_extra'])) {
            $fila['config_extra'] = json_encode($fila['config_extra'], JSON_UNESCAPED_UNICODE);
        }
        return $fila;
    }

    private function registrarVersion(int $productoId, int $version, string $cambios, ?Request $request): void
    {
        $snapshot = DB::table('productos_financieros')->where('id', $productoId)->first();
        DB::table('producto_versiones')->insert([
            'producto_id' => $productoId,
            'version'     => $version,
            'snapshot'    => json_encode($snapshot, JSON_UNESCAPED_UNICODE),
            'cambios'     => $cambios,
            'cambiado_por'=> $request?->user()?->id,
            'created_at'  => now(),
        ]);
    }

    private function describirCambios(array $antes, array $despues): string
    {
        $difs = [];
        foreach (self::CAMPOS as $c) {
            if (! array_key_exists($c, $despues)) continue;
            $nuevo = is_array($despues[$c]) ? json_encode($despues[$c]) : $despues[$c];
            $viejo = $antes[$c] ?? null;
            if ((string) $viejo !== (string) $nuevo) {
                $difs[] = "{$c}: {$viejo} → {$nuevo}";
            }
        }
        return implode('; ', array_slice($difs, 0, 20));
    }

    private function auditar(?Request $request, string $accion, int $id, array $datos): void
    {
        DB::table('auditoria')->insert([
            'usuario_id'   => $request?->user()?->id,
            'accion'       => $accion,
            'entidad'      => 'producto_financiero',
            'entidad_id'   => $id,
            'datos_nuevos' => json_encode($datos, JSON_UNESCAPED_UNICODE),
            'ip'           => $request?->ip(),
            'user_agent'   => $request?->userAgent(),
            'created_at'   => now(),
        ]);
    }
}

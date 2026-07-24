<?php

namespace App\Services;

use App\Models\Usuario;
use Illuminate\Support\Facades\DB;

/**
 * MOTOR DE MIGRACIÓN DE CARTERA (reutilizable).
 *
 * Flujo en dos tiempos, siempre:
 *   1) simular(): valida TODAS las filas y guarda el lote con su diagnóstico.
 *      NO toca clientes ni créditos. Es el paso obligatorio previo.
 *   2) importar(): ejecuta el lote simulado dentro de UNA transacción. Cualquier
 *      error revierte todo (rollback): jamás quedan registros parciales.
 *
 * El mapeo de columnas llega resuelto desde el asistente (frontend), de modo que
 * este motor recibe filas ya normalizadas a los campos del sistema. Eso lo hace
 * independiente del formato de origen (Excel, CSV o futuros).
 */
class MigracionService
{
    /** Campos del sistema que el asistente puede mapear. */
    public const CAMPOS = [
        // obligatorios
        'tipo_documento', 'numero_documento', 'nombres', 'apellidos', 'saldo_pendiente', 'producto',
        // opcionales
        'celular', 'telefono', 'direccion', 'barrio', 'ciudad', 'departamento',
        'area', 'cobrador', 'fecha_desembolso', 'fecha_ultimo_pago',
        'valor_desembolsado', 'numero_cuotas', 'cuotas_pendientes', 'modalidad', 'observaciones',
    ];

    private const TIPOS_DOC = ['CC', 'CE', 'TI', 'NIT', 'PASAPORTE'];
    private const MODALIDADES = ['DIARIO', 'SEMANAL', 'QUINCENAL', 'MENSUAL'];

    /**
     * SIMULACIÓN. Valida las filas, clasifica cada una y guarda el lote (estado
     * SIMULADA) con todos los registros y sus mensajes. No modifica cartera.
     *
     * @param array $filas   filas normalizadas [{tipo_documento, numero_documento, ...}]
     * @param array $config  ['nombre_archivo','plantilla_id','area_defecto_id','cobrador_defecto_id','producto_defecto_id']
     */
    public function simular(array $filas, array $config, Usuario $u): array
    {
        // Catálogos para validar referencias por nombre o código
        $productos = DB::table('productos_financieros')->get(['id', 'codigo', 'nombre']);
        $areas = DB::table('areas')->get(['id', 'nombre']);
        $cobradores = DB::table('usuarios')->where('activo', true)->get(['id', 'nombre', 'email']);

        $registros = [];
        $docsEnArchivo = [];   // detectar duplicados dentro del propio archivo
        $resumen = [
            'validos' => 0, 'con_advertencias' => 0, 'con_errores' => 0,
            'clientes_a_crear' => 0, 'clientes_a_actualizar' => 0,
            'creditos_a_crear' => 0, 'creditos_omitidos' => 0,
        ];

        foreach ($filas as $i => $fila) {
            $errores = [];
            $advertencias = [];
            $numFila = $i + 2; // +2: fila 1 del archivo son los encabezados

            // --- Obligatorios ---
            $tipoDoc = strtoupper(trim((string) ($fila['tipo_documento'] ?? 'CC')));
            $doc     = preg_replace('/\s+/', '', (string) ($fila['numero_documento'] ?? ''));
            $nombres = trim((string) ($fila['nombres'] ?? ''));
            $apellidos = trim((string) ($fila['apellidos'] ?? ''));
            $saldo   = $this->aNumero($fila['saldo_pendiente'] ?? null);

            if ($doc === '') $errores[] = 'Falta el número de documento.';
            if ($nombres === '') $errores[] = 'Faltan los nombres.';
            if ($apellidos === '') $errores[] = 'Faltan los apellidos.';
            if ($saldo === null || $saldo <= 0) $errores[] = 'El saldo pendiente debe ser un número mayor que cero.';
            if (! in_array($tipoDoc, self::TIPOS_DOC, true)) {
                $advertencias[] = "Tipo de documento '{$tipoDoc}' no reconocido; se usará CC.";
                $tipoDoc = 'CC';
            }

            // Duplicado dentro del archivo
            if ($doc !== '' && isset($docsEnArchivo[$doc])) {
                $errores[] = "Documento repetido en el archivo (ya aparece en la fila {$docsEnArchivo[$doc]}).";
            } elseif ($doc !== '') {
                $docsEnArchivo[$doc] = $numFila;
            }

            // --- Producto financiero: por columna o por defecto ---
            $productoId = null;
            $prodTexto = trim((string) ($fila['producto'] ?? ''));
            if ($prodTexto !== '') {
                $p = $productos->first(fn ($x) =>
                    strcasecmp($x->codigo, $prodTexto) === 0 || strcasecmp($x->nombre, $prodTexto) === 0);
                if ($p) $productoId = $p->id;
                else $advertencias[] = "Producto '{$prodTexto}' no existe; se usará el producto por defecto.";
            }
            if (! $productoId) {
                $productoId = $config['producto_defecto_id'] ?? null;
                if (! $productoId) $errores[] = 'Sin producto financiero (ni en el archivo ni por defecto).';
            }

            // --- Área y cobrador: por columna o por defecto ---
            $areaId = $this->resolver($areas, $fila['area'] ?? null, 'nombre')
                ?? ($config['area_defecto_id'] ?? null);
            if (! $areaId) $errores[] = 'Sin área (ni en el archivo ni por defecto).';

            $cobradorId = $this->resolver($cobradores, $fila['cobrador'] ?? null, 'nombre', 'email')
                ?? ($config['cobrador_defecto_id'] ?? null);
            if (! $cobradorId) $errores[] = 'Sin cobrador (ni en el archivo ni por defecto).';

            // --- Modalidad ---
            $modalidad = strtoupper(trim((string) ($fila['modalidad'] ?? '')));
            if ($modalidad !== '' && ! in_array($modalidad, self::MODALIDADES, true)) {
                $advertencias[] = "Modalidad '{$modalidad}' no reconocida; se usará MENSUAL.";
                $modalidad = 'MENSUAL';
            }
            if ($modalidad === '') $modalidad = 'MENSUAL';

            // --- Cliente existente / crédito duplicado (solo lectura) ---
            $accionCliente = 'CREAR';
            $accionCredito = 'CREAR';
            $clienteId = null;
            if ($doc !== '' && empty($errores)) {
                $cliente = DB::table('clientes')->where('numero_documento', $doc)->first(['id', 'nombres', 'apellidos']);
                if ($cliente) {
                    $clienteId = $cliente->id;
                    $accionCliente = 'ACTUALIZAR';
                    $advertencias[] = "El cliente ya existe ({$cliente->nombres} {$cliente->apellidos}); se actualizarán solo los campos vacíos.";

                    // ¿Ya tiene un crédito vigente por migración o activo?
                    $vigente = DB::table('solicitudes')->where('cliente_id', $cliente->id)
                        ->whereIn('estado', ['MIGRADO', 'ACTIVO', 'DESEMBOLSADO', 'EN_MORA'])->count();
                    if ($vigente > 0) {
                        $advertencias[] = "El cliente ya tiene {$vigente} crédito(s) vigente(s).";
                        // Mismo saldo migrado antes = duplicado casi seguro → omitir
                        $mismoSaldo = DB::table('solicitudes')->where('cliente_id', $cliente->id)
                            ->where('estado', 'MIGRADO')->where('saldo_migrado', $saldo)->exists();
                        if ($mismoSaldo) {
                            $accionCredito = 'OMITIR';
                            $advertencias[] = 'Crédito omitido: ya existe uno MIGRADO con el mismo saldo.';
                        }
                    }
                }
            }

            // --- Números opcionales ---
            $valorDesembolsado = $this->aNumero($fila['valor_desembolsado'] ?? null);
            $numCuotas = (int) ($this->aNumero($fila['numero_cuotas'] ?? null) ?? 0);
            $cuotasPend = (int) ($this->aNumero($fila['cuotas_pendientes'] ?? null) ?? 0);

            $resultado = ! empty($errores) ? 'ERROR' : (! empty($advertencias) ? 'ADVERTENCIA' : 'VALIDO');
            if ($resultado === 'ERROR') { $resumen['con_errores']++; }
            elseif ($resultado === 'ADVERTENCIA') { $resumen['con_advertencias']++; $resumen['validos']++; }
            else { $resumen['validos']++; }

            if ($resultado !== 'ERROR') {
                if ($accionCliente === 'CREAR') $resumen['clientes_a_crear']++;
                else $resumen['clientes_a_actualizar']++;
                if ($accionCredito === 'CREAR') $resumen['creditos_a_crear']++;
                else $resumen['creditos_omitidos']++;
            }

            $registros[] = [
                'fila' => $numFila,
                'datos' => json_encode([
                    'tipo_documento' => $tipoDoc, 'numero_documento' => $doc,
                    'nombres' => $nombres, 'apellidos' => $apellidos,
                    'saldo_pendiente' => $saldo, 'producto_id' => $productoId,
                    'area_id' => $areaId, 'cobrador_id' => $cobradorId, 'modalidad' => $modalidad,
                    'celular' => trim((string) ($fila['celular'] ?? ($fila['telefono'] ?? ''))) ?: null,
                    'direccion' => trim((string) ($fila['direccion'] ?? '')) ?: null,
                    'barrio' => trim((string) ($fila['barrio'] ?? '')) ?: null,
                    'ciudad' => trim((string) ($fila['ciudad'] ?? '')) ?: null,
                    'valor_desembolsado' => $valorDesembolsado,
                    'numero_cuotas' => $numCuotas ?: null,
                    'cuotas_pendientes' => $cuotasPend ?: null,
                    'fecha_desembolso' => $this->aFecha($fila['fecha_desembolso'] ?? null),
                    'fecha_ultimo_pago' => $this->aFecha($fila['fecha_ultimo_pago'] ?? null),
                    'observaciones' => trim((string) ($fila['observaciones'] ?? '')) ?: null,
                    'cliente_id_existente' => $clienteId,
                ], JSON_UNESCAPED_UNICODE),
                'resultado' => $resultado,
                'mensajes' => json_encode(array_merge(
                    array_map(fn ($e) => ['tipo' => 'error', 'texto' => $e], $errores),
                    array_map(fn ($a) => ['tipo' => 'advertencia', 'texto' => $a], $advertencias),
                ), JSON_UNESCAPED_UNICODE),
                'accion_cliente' => $resultado === 'ERROR' ? null : $accionCliente,
                'accion_credito' => $resultado === 'ERROR' ? null : $accionCredito,
            ];
        }

        // Guardar el LOTE simulado (metadata, no cartera)
        $migracionId = DB::table('migraciones')->insertGetId([
            'nombre_archivo'      => $config['nombre_archivo'] ?? 'archivo',
            'plantilla_id'        => $config['plantilla_id'] ?? null,
            'estado'              => 'SIMULADA',
            'area_defecto_id'     => $config['area_defecto_id'] ?? null,
            'cobrador_defecto_id' => $config['cobrador_defecto_id'] ?? null,
            'producto_defecto_id' => $config['producto_defecto_id'] ?? null,
            'total_registros'     => count($filas),
            'validos'             => $resumen['validos'],
            'con_advertencias'    => $resumen['con_advertencias'],
            'con_errores'         => $resumen['con_errores'],
            'clientes_a_crear'    => $resumen['clientes_a_crear'],
            'clientes_a_actualizar' => $resumen['clientes_a_actualizar'],
            'creditos_a_crear'    => $resumen['creditos_a_crear'],
            'creditos_omitidos'   => $resumen['creditos_omitidos'],
            'importado_por'       => $u->id,
            'created_at'          => now(),
        ]);

        foreach (array_chunk($registros, 200) as $lote) {
            DB::table('migracion_registros')->insert(array_map(
                fn ($r) => $r + ['migracion_id' => $migracionId, 'created_at' => now()], $lote
            ));
        }

        DB::table('auditoria')->insert([
            'usuario_id' => $u->id, 'accion' => 'MIGRACION_SIMULADA', 'entidad' => 'migracion',
            'entidad_id' => $migracionId,
            'datos_nuevos' => json_encode(['archivo' => $config['nombre_archivo'] ?? '', 'resumen' => $resumen], JSON_UNESCAPED_UNICODE),
            'created_at' => now(),
        ]);

        return ['migracion_id' => $migracionId, 'total' => count($filas)] + $resumen;
    }

    /**
     * IMPORTACIÓN definitiva de un lote SIMULADO. Una sola transacción: si algo
     * falla, rollback total. Crea/actualiza clientes, crea créditos MIGRADO con
     * su cuota única por el saldo, y deja la trazabilidad en cada registro.
     */
    public function importar(int $migracionId, Usuario $u): array
    {
        $lote = DB::table('migraciones')->where('id', $migracionId)->first();
        if (! $lote) throw new \DomainException('La simulación no existe.');
        if ($lote->estado === 'IMPORTADA') throw new \DomainException('Este lote ya fue importado.');
        if ((int) $lote->validos === 0) throw new \DomainException('El lote no tiene registros válidos para importar.');

        $registros = DB::table('migracion_registros')
            ->where('migracion_id', $migracionId)
            ->whereIn('resultado', ['VALIDO', 'ADVERTENCIA'])
            ->orderBy('fila')
            ->get();

        $creados = ['clientes' => 0, 'clientes_actualizados' => 0, 'creditos' => 0, 'omitidos' => 0];

        DB::transaction(function () use ($registros, $migracionId, $lote, $u, &$creados) {
            foreach ($registros as $reg) {
                $d = json_decode($reg->datos, true);

                // ---- CLIENTE: crear o completar (nunca duplicar) ----
                $clienteId = $d['cliente_id_existente'] ?? null;
                if ($clienteId) {
                    // Actualizar SOLO campos vacíos (autorizados): nunca pisar datos ya capturados
                    $cliente = DB::table('clientes')->where('id', $clienteId)->first();
                    $cambios = [];
                    if (empty($cliente->telefono_principal) && ! empty($d['celular'])) $cambios['telefono_principal'] = $d['celular'];
                    if (empty($cliente->direccion) && ! empty($d['direccion'])) $cambios['direccion'] = $d['direccion'];
                    if (empty($cliente->barrio) && ! empty($d['barrio'])) $cambios['barrio'] = $d['barrio'];
                    if ($cambios) {
                        $cambios['updated_at'] = now();
                        DB::table('clientes')->where('id', $clienteId)->update($cambios);
                        $creados['clientes_actualizados']++;
                    }
                } else {
                    $clienteId = DB::table('clientes')->insertGetId([
                        'area_id'          => $d['area_id'],
                        'cobrador_id'      => $d['cobrador_id'],
                        'nombres'          => $d['nombres'],
                        'apellidos'        => $d['apellidos'],
                        'tipo_documento'   => $d['tipo_documento'],
                        'numero_documento' => $d['numero_documento'],
                        'telefono_principal' => $d['celular'],
                        'direccion'        => $d['direccion'],
                        'barrio'           => $d['barrio'],
                        'created_at'       => now(),
                        'updated_at'       => now(),
                    ]);
                    $creados['clientes']++;
                }

                // ---- CRÉDITO MIGRADO (si no se omitió) ----
                $solicitudId = null;
                if ($reg->accion_credito === 'CREAR') {
                    $saldo = (float) $d['saldo_pendiente'];
                    $capital = (float) ($d['valor_desembolsado'] ?? $saldo);
                    $solicitudId = DB::table('solicitudes')->insertGetId([
                        'cliente_id'         => $clienteId,
                        'area_id'            => $d['area_id'],
                        'cobrador_id'        => $d['cobrador_id'],
                        'producto_financiero_id' => $d['producto_id'],
                        'capital_solicitado' => $capital,
                        'monto_aprobado'     => $capital,
                        'monto_desembolsado' => $capital,
                        'tasa_interes'       => 0,
                        'interes'            => 0,
                        'porcentaje_seguro'  => 0,
                        'valor_seguro'       => 0,
                        'modalidad'          => $d['modalidad'],
                        'numero_cuotas'      => 1,   // cuota única por el saldo; se corrige en validación
                        'valor_cuota'        => $saldo,
                        'total_financiado'   => $saldo,
                        'total_recaudar'     => $saldo,
                        'estado'             => 'MIGRADO',
                        'estado_validacion'  => 'PENDIENTE',
                        'migracion_id'       => $migracionId,
                        'saldo_migrado'      => $saldo,
                        'fecha_solicitud'    => $d['fecha_desembolso'] ?? now()->toDateString(),
                        // NOTA: solicitudes no tiene columna 'observaciones'; las del archivo
                        // quedan en migracion_registros.datos (trazabilidad del lote).
                        'created_by'         => $u->id,
                        'created_at'         => now(),
                        'updated_at'         => now(),
                    ]);

                    DB::table('solicitudes')->where('id', $solicitudId)
                        ->update(['numero_credito' => 'MIG-' . str_pad((string) $solicitudId, 6, '0', STR_PAD_LEFT)]);

                    // Cuota única por el saldo, vencimiento a 30 días (corregible en validación)
                    DB::table('cuotas')->insert([
                        'solicitud_id'      => $solicitudId,
                        'numero_cuota'      => 1,
                        'fecha_vencimiento' => now()->addDays(30)->toDateString(),
                        'valor'             => $saldo,
                        'valor_pagado'      => 0,
                        'saldo'             => $saldo,
                        'estado'            => 'PENDIENTE',
                        'created_at'        => now(),
                        'updated_at'        => now(),
                    ]);

                    $creados['creditos']++;
                } else {
                    $creados['omitidos']++;
                }

                DB::table('migracion_registros')->where('id', $reg->id)
                    ->update(['cliente_id' => $clienteId, 'solicitud_id' => $solicitudId]);
            }

            DB::table('migraciones')->where('id', $migracionId)->update([
                'estado' => 'IMPORTADA', 'importada_at' => now(),
            ]);

            DB::table('auditoria')->insert([
                'usuario_id' => $u->id, 'accion' => 'MIGRACION_IMPORTADA', 'entidad' => 'migracion',
                'entidad_id' => $migracionId,
                'datos_nuevos' => json_encode(['archivo' => $lote->nombre_archivo, 'resultado' => $creados], JSON_UNESCAPED_UNICODE),
                'created_at' => now(),
            ]);
        });

        return $creados;
    }

    /**
     * BLOQUEO AUTOMÁTICO (Fase 2): al primer movimiento financiero de un crédito
     * migrado (pago, renovación, refinanciación, abono), sus datos financieros
     * dejan de ser editables. Se registra en auditoría con el evento que lo bloqueó.
     * Estático para poder invocarse desde cualquier servicio sin acoplarlos.
     */
    public static function bloquearSiMigrado(int $solicitudId, ?int $usuarioId, string $evento): void
    {
        $s = DB::table('solicitudes')->where('id', $solicitudId)
            ->whereNotNull('migracion_id')
            ->where(fn ($q) => $q->whereNull('estado_validacion')->orWhere('estado_validacion', '!=', 'BLOQUEADO'))
            ->first(['id', 'estado_validacion']);
        if (! $s) return;

        DB::table('solicitudes')->where('id', $solicitudId)->update(['estado_validacion' => 'BLOQUEADO']);
        DB::table('auditoria')->insert([
            'usuario_id'       => $usuarioId,
            'accion'           => 'MIGRADO_BLOQUEADO',
            'entidad'          => 'solicitud',
            'entidad_id'       => $solicitudId,
            'datos_anteriores' => json_encode(['estado_validacion' => $s->estado_validacion], JSON_UNESCAPED_UNICODE),
            'datos_nuevos'     => json_encode(['estado_validacion' => 'BLOQUEADO', 'evento' => $evento], JSON_UNESCAPED_UNICODE),
            'created_at'       => now(),
        ]);
    }

    // ---------- helpers ----------

    /** Convierte "1.234.567", "1.234.567,89", "$ 850.000", "1234567.89" o número a float. */
    private function aNumero(mixed $v): ?float
    {
        if ($v === null || $v === '') return null;
        if (is_numeric($v)) return (float) $v;
        $s = preg_replace('/[^\d.,\-]/', '', (string) $v);
        if ($s === '') return null;

        // Ambos símbolos: el último es el decimal ("1.234.567,89" / "1,234,567.89")
        if (str_contains($s, ',') && str_contains($s, '.')) {
            if (strrpos($s, ',') > strrpos($s, '.')) $s = str_replace('.', '', $s);
            else $s = str_replace(',', '', $s);
            $s = str_replace(',', '.', $s);
            return is_numeric($s) ? (float) $s : null;
        }

        // Solo puntos: si el patrón es de MILES ("850.000", "1.234.567"), son separadores
        // de miles al estilo colombiano, no decimales. $850.000 = 850 mil pesos.
        if (str_contains($s, '.') && preg_match('/^-?\d{1,3}(\.\d{3})+$/', $s)) {
            $s = str_replace('.', '', $s);
        }
        // Solo comas: mismo criterio anglosajón ("850,000" = 850 mil)…
        elseif (str_contains($s, ',') && preg_match('/^-?\d{1,3}(,\d{3})+$/', $s)) {
            $s = str_replace(',', '', $s);
        }
        // …de lo contrario, una coma única es el decimal ("850,5")
        else {
            $s = str_replace(',', '.', $s);
        }

        return is_numeric($s) ? (float) $s : null;
    }

    private function aFecha(mixed $v): ?string
    {
        if ($v === null || $v === '') return null;
        try { return \Carbon\Carbon::parse((string) $v)->toDateString(); }
        catch (\Throwable) { return null; }
    }

    /** Busca en un catálogo por uno o dos campos de texto; devuelve el id o null. */
    private function resolver($coleccion, mixed $texto, string $campo, ?string $campo2 = null): ?int
    {
        $t = trim((string) ($texto ?? ''));
        if ($t === '') return null;
        $x = $coleccion->first(fn ($r) =>
            strcasecmp($r->{$campo}, $t) === 0 || ($campo2 && strcasecmp($r->{$campo2}, $t) === 0));
        return $x?->id;
    }
}

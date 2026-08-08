<?php

namespace App\Services;

use App\Models\Usuario;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class PermisoService
{
    /**
     * Catálogo de módulos del sistema con sus roles por defecto.
     * Si en el futuro se agrega un módulo, basta con añadirlo aquí:
     * aparecerá automáticamente en la pantalla de permisos del administrador.
     */
    public const MODULOS = [
        'inicio'         => ['etiqueta' => 'Inicio (indicadores)',       'defecto' => ['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR']],
        'inbox'          => ['etiqueta' => 'Bandeja de trabajo',          'defecto' => ['ADMINISTRADOR', 'SUPERVISOR']],
        'ruta'           => ['etiqueta' => 'Ruta del día',               'defecto' => ['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR']],
        'caja'           => ['etiqueta' => 'Caja individual',            'defecto' => ['SUPERVISOR', 'COBRADOR']],
        'mora'           => ['etiqueta' => 'Gestión de mora',            'defecto' => ['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR']],
        'caja-general'   => ['etiqueta' => 'Caja general',               'defecto' => ['ADMINISTRADOR']],
        'estado-cuenta'  => ['etiqueta' => 'Estado de cuenta empleados',  'defecto' => ['ADMINISTRADOR']],
        'solicitud'      => ['etiqueta' => 'Nueva solicitud',            'defecto' => ['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR']],
        'aprobaciones'   => ['etiqueta' => 'Aprobaciones',               'defecto' => ['ADMINISTRADOR', 'SUPERVISOR']],
        'pagos'          => ['etiqueta' => 'Cartera y pagos',            'defecto' => ['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR']],
        'reamortizacion' => ['etiqueta' => 'Reamortización',             'defecto' => ['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR']],
        'transferencias' => ['etiqueta' => 'Validar transferencias',     'defecto' => ['ADMINISTRADOR', 'SUPERVISOR']],
        'clientes'       => ['etiqueta' => 'Clientes',                   'defecto' => ['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR']],
        'mapa'           => ['etiqueta' => 'Mapa territorial',           'defecto' => ['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR']],
        'reportes'       => ['etiqueta' => 'Reportes',                   'defecto' => ['ADMINISTRADOR', 'SUPERVISOR']],
        'usuarios'       => ['etiqueta' => 'Usuarios y áreas',           'defecto' => ['ADMINISTRADOR']],
        'parametros'     => ['etiqueta' => 'Parámetros',                 'defecto' => ['ADMINISTRADOR']],
        'permisos'       => ['etiqueta' => 'Permisos',                   'defecto' => ['ADMINISTRADOR']],
        'migracion'      => ['etiqueta' => 'Migración de cartera',       'defecto' => ['ADMINISTRADOR']],
        'admin-funcional' => ['etiqueta' => 'Administración de plataforma', 'defecto' => ['ADMIN_FUNCIONAL']],
    ];

    /** Módulos que el administrador conserva siempre (no se puede dejar sin llaves de la casa). */
    private const SIEMPRE_ADMIN = ['usuarios', 'parametros', 'permisos'];

    /**
     * MOTOR DE AUTORIZACIONES POR ACCIÓN.
     * Catálogo central de acciones del sistema con sus roles por defecto.
     * Resolución: regla de usuario > regla de rol > defecto (misma tabla `permisos`,
     * usando la clave "modulo.accion" en la columna modulo — sin cambios de BD).
     * Los defaults REPLICAN las validaciones vigentes: activar el motor no cambia
     * el comportamiento actual; solo lo vuelve configurable y auditable.
     */
    /**
     * Acciones que puede ejecutar el ADMINISTRADOR FUNCIONAL.
     * Todo lo que no esté aquí (aprobar, desembolsar, pagos, caja, transferencias,
     * parámetros del negocio) le queda vedado: mueve dinero o decide sobre crédito.
     */
    /** Módulos de operación financiera: fuera del alcance del funcional. */
    public const MODULOS_FINANCIEROS = [
        'caja', 'caja-general', 'aprobaciones', 'pagos', 'transferencias',
        'reamortizacion', 'estado-cuenta', 'parametros',
    ];

    public const ACCIONES_TECNICAS = [
        'usuarios.gestionar',   // altas y bajas de personal en la plataforma
        'permisos.gestionar',   // configuración de la matriz
        'migrados.validar',     // herramienta de migración de cartera
        'migrados.editar',
        'documentos.subir',
        'documentos.eliminar',
        'reportes.exportar',    // consulta, no operación
    ];

    public const ACCIONES = [
        // Clientes
        'clientes.crear'        => ['etiqueta' => 'Crear clientes',                'defecto' => ['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR']],
        'clientes.editar'       => ['etiqueta' => 'Editar clientes',               'defecto' => ['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR']],
        // Créditos migrados (centro de validación)
        'migrados.validar'      => ['etiqueta' => 'Validar créditos migrados',     'defecto' => ['ADMINISTRADOR']],
        'migrados.editar'       => ['etiqueta' => 'Editar créditos migrados',      'defecto' => ['ADMINISTRADOR']],
        // Solicitudes / créditos
        'solicitudes.crear'     => ['etiqueta' => 'Crear solicitudes',             'defecto' => ['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR']],
        'solicitudes.aprobar'   => ['etiqueta' => 'Aprobar solicitudes',           'defecto' => ['ADMINISTRADOR', 'SUPERVISOR']],
        'solicitudes.rechazar'  => ['etiqueta' => 'Rechazar solicitudes',          'defecto' => ['ADMINISTRADOR', 'SUPERVISOR']],
        'solicitudes.eliminar'  => ['etiqueta' => 'Eliminar solicitudes',          'defecto' => ['ADMINISTRADOR']],
        'creditos.desembolsar'  => ['etiqueta' => 'Desembolsar créditos',          'defecto' => ['ADMINISTRADOR', 'SUPERVISOR']],
        'creditos.reamortizar'  => ['etiqueta' => 'Reamortizar créditos',          'defecto' => ['ADMINISTRADOR', 'SUPERVISOR']],
        // Pagos
        'pagos.registrar'       => ['etiqueta' => 'Registrar pagos',               'defecto' => ['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR']],
        'pagos.anular'          => ['etiqueta' => 'Anular pagos',                  'defecto' => ['ADMINISTRADOR', 'SUPERVISOR']],
        // Transferencias
        'transferencias.validar'=> ['etiqueta' => 'Validar transferencias',        'defecto' => ['ADMINISTRADOR', 'SUPERVISOR']],
        // Caja
        'caja.cerrar'           => ['etiqueta' => 'Cerrar caja individual',        'defecto' => ['SUPERVISOR', 'COBRADOR']],
        'caja-general.recibir'  => ['etiqueta' => 'Recibir cajas (tesorería)',     'defecto' => ['ADMINISTRADOR']],
        'caja-general.cerrar'   => ['etiqueta' => 'Ejecutar cierre general',       'defecto' => ['ADMINISTRADOR']],
        // Documentación
        'documentos.subir'      => ['etiqueta' => 'Subir documentos',              'defecto' => ['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR']],
        'documentos.eliminar'   => ['etiqueta' => 'Eliminar documentos',           'defecto' => ['ADMINISTRADOR', 'SUPERVISOR']],
        // Mora / cobranza
        'mora.gestionar'        => ['etiqueta' => 'Registrar gestiones de mora',   'defecto' => ['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR']],
        // Reportes
        'reportes.exportar'     => ['etiqueta' => 'Exportar reportes',             'defecto' => ['ADMINISTRADOR', 'SUPERVISOR']],
        // Configuración
        'usuarios.gestionar'    => ['etiqueta' => 'Gestionar usuarios',            'defecto' => ['ADMINISTRADOR']],
        'parametros.editar'     => ['etiqueta' => 'Editar parámetros',             'defecto' => ['ADMINISTRADOR']],
        'permisos.gestionar'    => ['etiqueta' => 'Gestionar permisos',            'defecto' => ['ADMINISTRADOR']],
    ];

    /** ¿Puede el usuario ejecutar la acción? Resolución: usuario > rol > defecto. */
    public function autoriza(Usuario $u, string $accion): bool
    {
        if (! array_key_exists($accion, self::ACCIONES)) {
            return true; // acción no catalogada: no bloquear (compatibilidad)
        }
        // SEPARACIÓN DE FUNCIONES: el Administrador Funcional configura la
        // plataforma, pero no mueve dinero ni decide sobre créditos. Solo se le
        // conceden las acciones técnicas listadas abajo; las financieras quedan
        // reservadas al Administrador del negocio, aunque alguien intente
        // asignárselas desde la matriz.
        // El Administrador Global no ejecuta acciones de negocio: administra la
        // plataforma. En Modo Soporte sí puede, para poder diagnosticar, y todo
        // queda registrado en la sesión de soporte.
        if ($u->esAdminGlobal()) {
            return (bool) $u->empresa_soporte_id;
        }

        if ($u->esAdminFuncional()) {
            return in_array($accion, self::ACCIONES_TECNICAS, true);
        }

        $reglas = Cache::remember("acciones:u{$u->id}", 30, function () use ($u) {
            return [
                'usuario' => DB::table('permisos')->where('usuario_id', $u->id)->whereNull('rol')
                    ->where('modulo', 'like', '%.%')->pluck('permitido', 'modulo'),
                'rol'     => DB::table('permisos')->where('rol', $u->rol)->whereNull('usuario_id')
                    ->where('modulo', 'like', '%.%')->pluck('permitido', 'modulo'),
            ];
        });

        if ($reglas['usuario']->has($accion)) return (bool) $reglas['usuario'][$accion];
        if ($reglas['rol']->has($accion))     return (bool) $reglas['rol'][$accion];
        return in_array($u->rol, self::ACCIONES[$accion]['defecto'], true);
    }

    /**
     * PUNTO ÚNICO DE ENFORCEMENT: exige la acción o corta con 403,
     * auditando el intento denegado (usuario, rol, permiso, ruta, IP, dispositivo).
     */
    public function exigir(\Illuminate\Http\Request $request, string $accion): void
    {
        $u = $request->user();
        if ($u && $this->autoriza($u, $accion)) {
            return;
        }

        DB::table('auditoria')->insert([
            'usuario_id'   => $u?->id,
            'accion'       => 'AUTORIZACION_DENEGADA',
            'entidad'      => 'permiso',
            'entidad_id'   => null,
            'datos_nuevos' => json_encode([
                'permiso'  => $accion,
                'rol'      => $u?->rol,
                'ruta'     => $request->path(),
                'metodo'   => $request->method(),
            ], JSON_UNESCAPED_UNICODE),
            'ip'           => $request->ip(),
            'user_agent'   => $request->userAgent(),
            'created_at'   => now(),
        ]);

        abort(403, 'No tienes permiso para ejecutar esta acción.');
    }

    /** ¿Puede el usuario acceder al módulo? Resolución: regla de usuario > regla de rol > defecto. */
    /**
     * Módulos que la empresa tiene habilitados. Se cachea por empresa: se
     * consulta en cada verificación de acceso y cambia muy poco.
     * Devuelve null cuando la empresa no tiene configuración (todo permitido),
     * para no dejar fuera a instalaciones anteriores a esta funcionalidad.
     */
    public function modulosDeLaEmpresa(?int $empresaId): ?array
    {
        if (! $empresaId) return null;

        return \Illuminate\Support\Facades\Cache::remember(
            "empresa:{$empresaId}:modulos", 300,
            function () use ($empresaId) {
                $filas = DB::table('empresa_modulos')
                    ->where('empresa_id', $empresaId)
                    ->pluck('habilitado', 'modulo_codigo');
                return $filas->isEmpty() ? null : $filas->all();
            }
        );
    }

    public function permite(Usuario $u, string $modulo): bool
    {
        if ($u->esAdminGlobal()) {
            return in_array($modulo, self::MODULOS_PLATAFORMA, true)
                || (bool) $u->empresa_soporte_id;   // en soporte accede a la empresa visitada
        }

        // 1) ¿La EMPRESA tiene contratado este módulo? Si no, nadie lo ve,
        //    por muchos permisos individuales que tenga.
        $deLaEmpresa = $this->modulosDeLaEmpresa($u->empresa_id ? (int) $u->empresa_id : null);
        if ($deLaEmpresa !== null && array_key_exists($modulo, $deLaEmpresa) && ! $deLaEmpresa[$modulo]) {
            return false;
        }

        if (! array_key_exists($modulo, self::MODULOS)) {
            return true; // módulo no catalogado: no bloquear
        }
        // El módulo de administración de plataforma es exclusivo del Administrador Funcional.
        if ($modulo === 'admin-funcional') {
            return $u->esAdminFuncional();
        }
        // La caja individual es solo operativa: el administrador (que no recauda) no la usa;
        // en su lugar tiene la Caja General. El admin funcional sí puede verla todo.
        if ($modulo === 'caja' && $u->esAdministradorOperativo()) {
            return false;
        }
        // La caja general es exclusiva del administrador (operativo o funcional).
        if ($modulo === 'caja-general') {
            return $u->esAdministracion();
        }
        if ($u->esAdministracion()) {
            return true; // el administrador accede a todo lo operativo (salvo lo anterior)
        }

        return in_array($modulo, $this->modulosDe($u), true);
    }

    /** Lista de módulos permitidos para el usuario (con caché corto para efecto casi inmediato). */
    /** Módulos exclusivos de la administración de la plataforma KRYPTA. */
    public const MODULOS_PLATAFORMA = ['empresas', 'monitoreo'];

    public function modulosDe(Usuario $u): array
    {
        // Administrador Funcional Global: gobierna la plataforma, no opera ninguna
        // empresa. Ve sus módulos propios y, en Modo Soporte, los de la empresa
        // que esté visitando.
        if ($u->esAdminGlobal()) {
            $base = self::MODULOS_PLATAFORMA;
            if ($u->empresa_soporte_id) {
                $base = array_merge($base, array_values(array_filter(
                    array_keys(self::MODULOS),
                    fn ($m) => $m !== 'admin-funcional'
                )));
            }
            return $base;
        }

        if ($u->esAdminFuncional()) {
            // El funcional accede a configuración y consulta, no a la operación
            // financiera diaria (caja, aprobaciones, pagos, transferencias).
            return array_values(array_diff(array_keys(self::MODULOS), self::MODULOS_FINANCIEROS));
        }
        if ($u->esAdministracion()) {
            // Admin operativo: todo MENOS la caja individual (no recauda) y el módulo del funcional.
            return array_values(array_filter(
                array_keys(self::MODULOS),
                fn ($m) => $m !== 'admin-funcional' && $m !== 'caja'
            ));
        }

        return Cache::remember("permisos:u{$u->id}", 30, function () use ($u) {
            $deLaEmpresa = $this->modulosDeLaEmpresa($u->empresa_id ? (int) $u->empresa_id : null);
            $filtrar = fn (array $m) => $deLaEmpresa === null ? $m : array_values(array_filter(
                $m, fn ($cod) => ! array_key_exists($cod, $deLaEmpresa) || $deLaEmpresa[$cod]
            ));
            $reglasUsuario = DB::table('permisos')
                ->where('usuario_id', $u->id)->whereNull('rol')
                ->pluck('permitido', 'modulo');

            $reglasRol = DB::table('permisos')
                ->where('rol', $u->rol)->whereNull('usuario_id')
                ->pluck('permitido', 'modulo');

            $permitidos = [];
            foreach (self::MODULOS as $id => $def) {
                if ($reglasUsuario->has($id)) {
                    $ok = (bool) $reglasUsuario[$id];
                } elseif ($reglasRol->has($id)) {
                    $ok = (bool) $reglasRol[$id];
                } else {
                    $ok = in_array($u->rol, $def['defecto'], true);
                }
                if ($ok) $permitidos[] = $id;
            }
            // Se descartan los módulos que la empresa no tiene contratados:
            // aunque el permiso individual exista, el módulo no está disponible.
            return $filtrar($permitidos);
        });
    }

    /** Crea/actualiza una regla (por rol o por usuario) y aplica de inmediato. */
    public function fijar(string $modulo, ?string $rol, ?int $usuarioId, bool $permitido): void
    {
        // Acepta claves de módulo ('caja') y de acción ('pagos.anular')
        abort_unless(
            array_key_exists($modulo, self::MODULOS) || array_key_exists($modulo, self::ACCIONES),
            422, 'Módulo o acción no válida.'
        );
        abort_if($rol === null && $usuarioId === null, 422, 'Indica un rol o un usuario.');
        abort_if(
            $rol === 'ADMINISTRADOR' && in_array($modulo, self::SIEMPRE_ADMIN, true) && ! $permitido,
            422, 'El administrador no puede quedar sin acceso a este módulo.'
        );
        // Mismo blindaje para las acciones de administración (evita el auto-bloqueo)
        abort_if(
            $rol === 'ADMINISTRADOR'
                && in_array($modulo, ['usuarios.gestionar', 'parametros.editar', 'permisos.gestionar'], true)
                && ! $permitido,
            422, 'El administrador no puede quedar sin esta acción de administración.'
        );

        $condicion = ['modulo' => $modulo, 'rol' => $rol, 'usuario_id' => $usuarioId];

        $existe = DB::table('permisos')->where($condicion)->exists();
        if ($existe) {
            DB::table('permisos')->where($condicion)->update(['permitido' => $permitido, 'updated_at' => now()]);
        } else {
            DB::table('permisos')->insert($condicion + ['permitido' => $permitido, 'updated_at' => now()]);
        }

        // Efecto inmediato: limpiar cachés de permisos (módulos y acciones)
        if ($usuarioId) {
            Cache::forget("permisos:u{$usuarioId}");
            Cache::forget("acciones:u{$usuarioId}");
        } else {
            foreach (DB::table('usuarios')->where('rol', $rol)->pluck('id') as $id) {
                Cache::forget("permisos:u{$id}");
                Cache::forget("acciones:u{$id}");
            }
        }
    }
}

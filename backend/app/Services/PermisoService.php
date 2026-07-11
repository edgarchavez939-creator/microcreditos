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
        'ruta'           => ['etiqueta' => 'Ruta del día',               'defecto' => ['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR']],
        'caja'           => ['etiqueta' => 'Caja individual',            'defecto' => ['SUPERVISOR', 'COBRADOR']],
        'mora'           => ['etiqueta' => 'Gestión de mora',            'defecto' => ['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR']],
        'caja-general'   => ['etiqueta' => 'Caja general',               'defecto' => ['ADMINISTRADOR']],
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
        'admin-funcional' => ['etiqueta' => 'Administración de plataforma', 'defecto' => ['ADMIN_FUNCIONAL']],
    ];

    /** Módulos que el administrador conserva siempre (no se puede dejar sin llaves de la casa). */
    private const SIEMPRE_ADMIN = ['usuarios', 'parametros', 'permisos'];

    /** ¿Puede el usuario acceder al módulo? Resolución: regla de usuario > regla de rol > defecto. */
    public function permite(Usuario $u, string $modulo): bool
    {
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
            return $u->esAdministrador();
        }
        if ($u->esAdministrador()) {
            return true; // el administrador accede a todo lo operativo (salvo lo anterior)
        }

        return in_array($modulo, $this->modulosDe($u), true);
    }

    /** Lista de módulos permitidos para el usuario (con caché corto para efecto casi inmediato). */
    public function modulosDe(Usuario $u): array
    {
        if ($u->esAdminFuncional()) {
            return array_keys(self::MODULOS); // acceso total, incluido admin-funcional
        }
        if ($u->esAdministrador()) {
            // Admin operativo: todo MENOS la caja individual (no recauda) y el módulo del funcional.
            return array_values(array_filter(
                array_keys(self::MODULOS),
                fn ($m) => $m !== 'admin-funcional' && $m !== 'caja'
            ));
        }

        return Cache::remember("permisos:u{$u->id}", 30, function () use ($u) {
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
            return $permitidos;
        });
    }

    /** Crea/actualiza una regla (por rol o por usuario) y aplica de inmediato. */
    public function fijar(string $modulo, ?string $rol, ?int $usuarioId, bool $permitido): void
    {
        abort_unless(array_key_exists($modulo, self::MODULOS), 422, 'Módulo no válido.');
        abort_if($rol === null && $usuarioId === null, 422, 'Indica un rol o un usuario.');
        abort_if(
            $rol === 'ADMINISTRADOR' && in_array($modulo, self::SIEMPRE_ADMIN, true) && ! $permitido,
            422, 'El administrador no puede quedar sin acceso a este módulo.'
        );

        $condicion = ['modulo' => $modulo, 'rol' => $rol, 'usuario_id' => $usuarioId];

        $existe = DB::table('permisos')->where($condicion)->exists();
        if ($existe) {
            DB::table('permisos')->where($condicion)->update(['permitido' => $permitido, 'updated_at' => now()]);
        } else {
            DB::table('permisos')->insert($condicion + ['permitido' => $permitido, 'updated_at' => now()]);
        }

        // Efecto inmediato: limpiar cachés de permisos
        if ($usuarioId) {
            Cache::forget("permisos:u{$usuarioId}");
        } else {
            foreach (DB::table('usuarios')->where('rol', $rol)->pluck('id') as $id) {
                Cache::forget("permisos:u{$id}");
            }
        }
    }
}

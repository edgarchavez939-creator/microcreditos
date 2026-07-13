<?php
namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Tymon\JWTAuth\Contracts\JWTSubject;

class Usuario extends Authenticatable implements JWTSubject
{
    protected $table = 'usuarios';
    protected $fillable = [
        'nombre','nombres','apellidos','tipo_documento','numero_documento',
        'email','password','rol','telefono','activo',
        'direccion','fecha_nacimiento','contacto_emergencia_nombre','contacto_emergencia_telefono',
        'salario_base','banco','numero_cuenta',
        'twofa_secret','twofa_enabled','intentos_fallidos','bloqueado_hasta',
        'ultimo_login_at','ultimo_login_ip',
    ];
    protected $hidden = ['password','twofa_secret'];
    protected $casts = [
        'activo' => 'boolean',
        'twofa_enabled' => 'boolean',
        'bloqueado_hasta' => 'datetime',
        'ultimo_login_at' => 'datetime',
        'twofa_secret' => 'encrypted',
    ];

    public function areas(): BelongsToMany
    {
        return $this->belongsToMany(Area::class, 'usuario_area', 'usuario_id', 'area_id');
    }

    /**
     * MODELO DE SEGURIDAD TERRITORIAL.
     * IDs de las áreas cuya información financiera puede ver el usuario.
     * - Administrador y Admin Funcional: todas las áreas (retorna null = sin filtro).
     * - Supervisor y Cobrador: solo sus áreas asignadas.
     * El cobrador_id del cliente NO controla el acceso (solo es dato operativo).
     */
    public function areasVisibles(): ?array
    {
        if ($this->esAdministrador()) {
            return null; // null = acceso global (sin filtrar por área)
        }
        return $this->areas()->pluck('areas.id')->map(fn ($id) => (int) $id)->all();
    }

    public function esAdminFuncional(): bool { return $this->rol === 'ADMIN_FUNCIONAL'; }
    public function esAdministrador(): bool { return $this->rol === 'ADMINISTRADOR' || $this->rol === 'ADMIN_FUNCIONAL'; }
    public function esSupervisor(): bool   { return $this->rol === 'SUPERVISOR'; }
    public function esCobrador(): bool      { return $this->rol === 'COBRADOR'; }
    /** Solo el rol administrador operativo puro (sin incluir al funcional). */
    public function esAdministradorOperativo(): bool { return $this->rol === 'ADMINISTRADOR'; }

    public function estaBloqueado(): bool
    {
        return $this->bloqueado_hasta && $this->bloqueado_hasta->isFuture();
    }

    // JWTSubject
    public function getJWTIdentifier() { return $this->getKey(); }
    public function getJWTCustomClaims(): array
    {
        return ['rol' => $this->rol, 'nombre' => $this->nombre];
    }
}

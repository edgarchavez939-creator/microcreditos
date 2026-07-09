<?php
namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Tymon\JWTAuth\Contracts\JWTSubject;

class Usuario extends Authenticatable implements JWTSubject
{
    protected $table = 'usuarios';
    protected $fillable = [
        'nombre','email','password','rol','telefono','activo',
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

    public function esAdministrador(): bool { return $this->rol === 'ADMINISTRADOR'; }
    public function esSupervisor(): bool   { return $this->rol === 'SUPERVISOR'; }
    public function esCobrador(): bool      { return $this->rol === 'COBRADOR'; }

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

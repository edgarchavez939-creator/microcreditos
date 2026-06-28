<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Area extends Model
{
    protected $table = 'areas';
    protected $fillable = ['nombre','descripcion','activa'];
    protected $casts = ['activa' => 'boolean'];

    public function usuarios(): BelongsToMany
    {
        return $this->belongsToMany(Usuario::class, 'usuario_area', 'area_id', 'usuario_id');
    }

    public function limiteSupervisor(): ?float
    {
        $l = LimiteAprobacion::where('activo', true)
            ->where('area_id', $this->id)->whereNull('usuario_id')
            ->where('rol', 'SUPERVISOR')->value('monto_maximo');
        if ($l !== null) return (float) $l;
        return (float) (LimiteAprobacion::where('activo', true)->whereNull('area_id')
            ->whereNull('usuario_id')->where('rol', 'SUPERVISOR')->value('monto_maximo') ?? 0);
    }
}

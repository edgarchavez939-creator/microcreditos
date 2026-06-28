<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LimiteAprobacion extends Model
{
    protected $table = 'limites_aprobacion';
    protected $fillable = ['rol','area_id','usuario_id','monto_maximo','activo'];
    protected $casts = ['monto_maximo' => 'decimal:2', 'activo' => 'boolean'];
}

<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

class Parametro extends Model
{
    protected $table = 'parametros';
    public $timestamps = false;
    protected $fillable = ['clave','valor','descripcion','updated_at'];
    protected $casts = ['valor' => 'array', 'updated_at' => 'datetime'];

    public static function valor(string $clave, $default = null)
    {
        return Cache::remember("param:{$clave}", 300, function () use ($clave, $default) {
            $p = static::where('clave', $clave)->first();
            return $p ? $p->valor : $default;
        });
    }
}

<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Cliente extends Model
{
    protected $table = 'clientes';
    protected $fillable = [
        'area_id','cobrador_id','nombres','apellidos','tipo_documento','numero_documento',
        'fecha_nacimiento','fecha_expedicion_documento','lugar_expedicion_documento','lugar_nacimiento','genero','estado_civil','telefono_principal','telefono_secundario',
        'correo','direccion','barrio','ciudad','referencia_ubicacion','latitud','longitud',
        'empresa','cargo','antiguedad_meses','salario','direccion_laboral','telefono_laboral',
        'activo','created_by','cupo_inicial','cupo_disponible',
    ];
    protected $casts = [
        'fecha_nacimiento' => 'date',
        'fecha_expedicion_documento' => 'date',
        'latitud' => 'decimal:7', 'longitud' => 'decimal:7',
        'salario' => 'decimal:2', 'activo' => 'boolean',
        'cupo_inicial' => 'decimal:2', 'cupo_disponible' => 'decimal:2',
    ];

    public function area(): BelongsTo { return $this->belongsTo(Area::class); }
    public function cobrador(): BelongsTo { return $this->belongsTo(Usuario::class, 'cobrador_id'); }
    public function referencias(): HasMany { return $this->hasMany(Referencia::class); }
    public function documentos(): HasMany { return $this->hasMany(Documento::class); }
    public function solicitudes(): HasMany { return $this->hasMany(Solicitud::class); }
}

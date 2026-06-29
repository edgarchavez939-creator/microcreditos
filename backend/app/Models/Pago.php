<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Pago extends Model
{
    // La tabla solo tiene created_at (no updated_at)
    public const UPDATED_AT = null;
    protected $table = 'pagos';
    protected $fillable = [
        'cliente_id','solicitud_id','cuota_id','fecha','valor','metodo',
        'registrado_por','client_uuid','observaciones',
    ];
    protected $casts = ['fecha' => 'date', 'valor' => 'decimal:2'];

    public function solicitud(): BelongsTo { return $this->belongsTo(Solicitud::class); }
    public function cuota(): BelongsTo { return $this->belongsTo(Cuota::class); }
    public function registrador(): BelongsTo { return $this->belongsTo(Usuario::class, 'registrado_por'); }
}

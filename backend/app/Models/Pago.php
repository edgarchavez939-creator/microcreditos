<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Pago extends Model
{
    protected $table = 'pagos';
    protected $fillable = [
        'cliente_id','solicitud_id','cuota_id','fecha','valor','metodo',
        'registrado_por','client_uuid',
    ];
    protected $casts = ['fecha' => 'date', 'valor' => 'decimal:2'];

    public function solicitud(): BelongsTo { return $this->belongsTo(Solicitud::class); }
    public function cuota(): BelongsTo { return $this->belongsTo(Cuota::class); }
}

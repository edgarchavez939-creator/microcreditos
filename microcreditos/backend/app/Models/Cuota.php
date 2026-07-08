<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Cuota extends Model
{
    protected $table = 'cuotas';
    protected $fillable = [
        'solicitud_id','numero_cuota','fecha_vencimiento','valor',
        'abono_capital','abono_interes',
        'valor_pagado','saldo','estado','dias_mora',
    ];
    protected $casts = [
        'fecha_vencimiento' => 'date',
        'valor' => 'decimal:2', 'valor_pagado' => 'decimal:2', 'saldo' => 'decimal:2',
    ];
    public function solicitud(): BelongsTo { return $this->belongsTo(Solicitud::class); }
}

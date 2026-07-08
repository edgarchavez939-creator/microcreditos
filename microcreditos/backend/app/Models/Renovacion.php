<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Renovacion extends Model
{
    protected $table = 'renovaciones';
    public $timestamps = false;
    protected $guarded = ['id'];
    protected $casts = [
        'saldo_refinanciado' => 'decimal:2', 'capital_aprobado' => 'decimal:2',
        'porcentaje_seguro' => 'decimal:4', 'valor_seguro' => 'decimal:2',
        'valor_desembolsado' => 'decimal:2', 'dinero_adicional' => 'decimal:2',
        'recibido_cliente' => 'decimal:2', 'interes_generado' => 'decimal:2',
        'total_deuda_nueva' => 'decimal:2', 'cupo_disponible_despues' => 'decimal:2',
        'fecha_renovacion' => 'datetime',
    ];

    public function creditoOrigen(): BelongsTo { return $this->belongsTo(Solicitud::class, 'credito_origen_id'); }
    public function creditoNuevo(): BelongsTo { return $this->belongsTo(Solicitud::class, 'credito_nuevo_id'); }
}

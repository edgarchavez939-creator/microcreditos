<?php
namespace App\Models;

use App\Enums\EstadoSolicitud;
use DomainException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Solicitud extends Model
{
    protected $table = 'solicitudes';
    protected $fillable = [
        'cliente_id','area_id','cobrador_id','producto_id','es_venta_financiada',
        'capital_solicitado','monto_aprobado','tasa_interes','tipo_interes','interes',
        'modalidad','numero_cuotas','fecha_primer_pago','valor_cuota','total_financiado',
        'porcentaje_seguro','valor_seguro','monto_desembolsado','total_recaudar',
        'seguro_exonerado','motivo_exoneracion','exoneracion_solicitada_por',
        'exoneracion_aprobada_por','estado','usuario_aprobador','fecha_aprobacion',
        'motivo_rechazo','fecha_solicitud','created_by',
        // capa de amortización
        'credito_origen_id','plazo_meses','saldo_refinanciado','total_pagado',
    ];
    protected $casts = [
        'es_venta_financiada' => 'boolean',
        'seguro_exonerado' => 'boolean',
        'capital_solicitado' => 'decimal:2', 'monto_aprobado' => 'decimal:2',
        'tasa_interes' => 'decimal:4', 'interes' => 'decimal:2',
        'porcentaje_seguro' => 'decimal:4', 'valor_seguro' => 'decimal:2',
        'monto_desembolsado' => 'decimal:2', 'total_recaudar' => 'decimal:2',
        'valor_cuota' => 'decimal:2', 'total_financiado' => 'decimal:2',
        'saldo_refinanciado' => 'decimal:2', 'total_pagado' => 'decimal:2',
        'plazo_meses' => 'integer',
        'fecha_primer_pago' => 'date', 'fecha_solicitud' => 'date',
        'fecha_aprobacion' => 'datetime',
    ];

    protected static function booted(): void
    {
        // No se pueden modificar créditos históricos
        static::updating(function (Solicitud $s) {
            $estadoOriginal = $s->getOriginal('estado');
            if (in_array($estadoOriginal, EstadoSolicitud::historicos(), true)) {
                throw new DomainException('No se pueden modificar créditos históricos.');
            }
        });
        // No se pueden eliminar créditos con renovaciones relacionadas
        static::deleting(function (Solicitud $s) {
            $tieneHijos = static::where('credito_origen_id', $s->id)->exists()
                || Renovacion::where('credito_origen_id', $s->id)->exists();
            if ($tieneHijos) {
                throw new DomainException('No se puede eliminar un crédito con renovaciones relacionadas.');
            }
        });
    }

    public function cliente(): BelongsTo { return $this->belongsTo(Cliente::class); }
    public function area(): BelongsTo { return $this->belongsTo(Area::class); }
    public function cobrador(): BelongsTo { return $this->belongsTo(Usuario::class, 'cobrador_id'); }
    public function cuotas(): HasMany { return $this->hasMany(Cuota::class)->orderBy('numero_cuota'); }
    public function pagos(): HasMany { return $this->hasMany(Pago::class); }
    public function desembolsos(): HasMany { return $this->hasMany(Desembolso::class); }

    // Trazabilidad padre-hijo
    public function creditoOrigen(): BelongsTo { return $this->belongsTo(Solicitud::class, 'credito_origen_id'); }
    public function creditosHijos(): HasMany { return $this->hasMany(Solicitud::class, 'credito_origen_id'); }

    /** Saldo pendiente = total deuda − pagos realizados. */
    public function saldoPendiente(): float
    {
        $pagado = (float) $this->pagos()->where('aplicado', true)->sum('valor');
        return round((float) $this->total_recaudar - $pagado, 2);
    }
}

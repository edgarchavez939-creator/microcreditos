<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CierreCaja extends Model
{
    use \App\Models\Concerns\PerteneceAEmpresa;

    // La tabla solo tiene created_at (no updated_at)
    public const UPDATED_AT = null;
    protected $table = 'cierres_caja';
    protected $guarded = ['id'];
}

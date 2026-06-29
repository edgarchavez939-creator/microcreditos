<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class GestionMora extends Model
{
    // La tabla solo tiene created_at (no updated_at)
    public const UPDATED_AT = null;
    protected $table = 'gestiones_mora';
    protected $guarded = ['id'];
}

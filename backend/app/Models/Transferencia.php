<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Transferencia extends Model
{
    // La tabla solo tiene created_at (no updated_at)
    public const UPDATED_AT = null;
    protected $guarded = ['id'];
}

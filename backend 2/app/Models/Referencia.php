<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Referencia extends Model
{
    // La tabla solo tiene created_at (no updated_at)
    public const UPDATED_AT = null;
    protected $table = 'referencias';
    protected $guarded = ['id'];
}

<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RefreshToken extends Model
{
    protected $table = 'refresh_tokens';
    protected $guarded = ['id'];

    // La tabla solo tiene created_at (no updated_at)
    public const UPDATED_AT = null;
    protected $casts = [
        'revocado' => 'boolean',
        'expira_at' => 'datetime',
    ];
}

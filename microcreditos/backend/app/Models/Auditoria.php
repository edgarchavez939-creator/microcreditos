<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Auditoria extends Model
{
    protected $table = 'auditoria';
    public $timestamps = false;
    protected $guarded = ['id'];
}

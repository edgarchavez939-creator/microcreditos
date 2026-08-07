<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Producto extends Model
{
    use \App\Models\Concerns\PerteneceAEmpresa;

    protected $guarded = ['id'];
}

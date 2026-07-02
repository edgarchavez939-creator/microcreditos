<?php
namespace App\Policies;

use App\Models\Cliente;
use App\Models\Usuario;
use Illuminate\Support\Facades\DB;

class ClientePolicy
{
    public function viewAny(Usuario $u): bool
    {
        return in_array($u->rol, ['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR'], true);
    }

    public function view(Usuario $u, Cliente $c): bool
    {
        if ($u->esAdministrador()) return true;
        if ($u->esSupervisor()) {
            return DB::table('usuario_area')->where('usuario_id', (int) $u->id)
                ->where('area_id', (int) $c->area_id)->exists();
        }
        return (int) $c->cobrador_id === (int) $u->id;
    }

    public function create(Usuario $u): bool
    {
        return in_array($u->rol, ['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR'], true);
    }

    public function update(Usuario $u, Cliente $c): bool
    {
        if ($u->esAdministrador()) return true;
        if ($u->esSupervisor()) {
            return DB::table('usuario_area')->where('usuario_id', (int) $u->id)
                ->where('area_id', (int) $c->area_id)->exists();
        }
        return (int) $c->cobrador_id === (int) $u->id;
    }
}

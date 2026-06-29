<?php
namespace App\Policies;

use App\Models\Cliente;
use App\Models\Usuario;

class ClientePolicy
{
    public function viewAny(Usuario $u): bool
    {
        return in_array($u->rol, ['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR'], true);
    }

    public function view(Usuario $u, Cliente $c): bool
    {
        if ($u->esAdministrador()) return true;
        if ($u->esSupervisor())    return $u->areas()->where('areas.id', $c->area_id)->exists();
        return $c->cobrador_id === $u->id;
    }

    public function create(Usuario $u): bool
    {
        return in_array($u->rol, ['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR'], true);
    }

    public function update(Usuario $u, Cliente $c): bool
    {
        if ($u->esAdministrador()) return true;
        if ($u->esSupervisor())    return $u->areas()->where('areas.id', $c->area_id)->exists();
        return $c->cobrador_id === $u->id;
    }
}

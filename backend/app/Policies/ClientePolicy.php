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
        // Modelo territorial: los clientes se consultan sin restricción de área
        // (cualquier usuario autorizado puede localizarlos). La información financiera
        // se restringe en sus propios controladores/policies.
        return in_array($u->rol, ['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR', 'ADMIN_FUNCIONAL'], true);
    }

    public function create(Usuario $u): bool
    {
        return in_array($u->rol, ['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR'], true);
    }

    public function update(Usuario $u, Cliente $c): bool
    {
        // Editar el cliente sí requiere pertenecer a su área (o ser admin).
        if ($u->esAdministrador()) return true;
        return DB::table('usuario_area')->where('usuario_id', (int) $u->id)
            ->where('area_id', (int) $c->area_id)->exists();
    }
}

<?php
namespace App\Policies;

use App\Models\Solicitud;
use App\Models\Usuario;

class SolicitudPolicy
{
    public function viewAny(Usuario $u): bool
    {
        return in_array($u->rol, ['ADMINISTRADOR','SUPERVISOR','COBRADOR'], true);
    }

    public function view(Usuario $u, Solicitud $s): bool
    {
        if ($u->esAdministrador()) return true;
        if ($u->esSupervisor())    return $u->areas()->where('areas.id', $s->area_id)->exists();
        return $s->cobrador_id === $u->id;
    }

    public function create(Usuario $u): bool
    {
        // Cobrador crea solicitudes; admin/supervisor también pueden.
        return in_array($u->rol, ['ADMINISTRADOR','SUPERVISOR','COBRADOR'], true);
    }

    public function update(Usuario $u, Solicitud $s): bool
    {
        if ($u->esAdministrador()) return true;
        return $s->cobrador_id === $u->id && $s->estado === 'BORRADOR';
    }

    /** Aprobar/rechazar: nunca cobrador. Exoneración: solo admin. */
    public function approve(Usuario $u, Solicitud $s): bool
    {
        if ($u->esCobrador()) return false;
        if ($s->seguro_exonerado) return $u->esAdministrador();
        if ($u->esAdministrador()) return true;
        return $u->esSupervisor() && $u->areas()->where('areas.id', $s->area_id)->exists();
    }

    /** Reamortizar: cobrador dueño, supervisor del área o administrador. */
    public function reamortizar(Usuario $u, Solicitud $s): bool
    {
        if ($u->esAdministrador()) return true;
        if ($u->esSupervisor())    return $u->areas()->where('areas.id', $s->area_id)->exists();
        return $s->cobrador_id === $u->id;
    }
}

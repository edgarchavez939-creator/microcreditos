<?php
namespace App\Policies;

use App\Models\Solicitud;
use App\Models\Usuario;
use Illuminate\Support\Facades\DB;

class SolicitudPolicy
{
    public function viewAny(Usuario $u): bool
    {
        return in_array($u->rol, ['ADMINISTRADOR','SUPERVISOR','COBRADOR'], true);
    }

    /**
     * MODELO TERRITORIAL: ¿el usuario cubre el área ACTUAL del cliente?
     * El área se obtiene en vivo del cliente (no del crédito), así que un cambio de
     * área del cliente reasigna la visibilidad automáticamente. Aplica igual a
     * cobradores y supervisores. El cobrador_id ya no controla el acceso.
     */
    private function cubreArea(Usuario $u, Solicitud $s): bool
    {
        $areaCliente = DB::table('clientes')->where('id', $s->cliente_id)->value('area_id');
        if ($areaCliente === null) return false;

        return DB::table('usuario_area')
            ->where('usuario_id', (int) $u->id)
            ->where('area_id', (int) $areaCliente)
            ->exists();
    }

    public function view(Usuario $u, Solicitud $s): bool
    {
        if ($u->esAdministrador()) return true;
        return $this->cubreArea($u, $s);
    }

    public function create(Usuario $u): bool
    {
        return in_array($u->rol, ['ADMINISTRADOR','SUPERVISOR','COBRADOR'], true);
    }

    public function update(Usuario $u, Solicitud $s): bool
    {
        if ($u->esAdministrador()) return true;
        return $this->cubreArea($u, $s) && $s->estado === 'BORRADOR';
    }

    /** Aprobar/rechazar: nunca cobrador. Exoneración: solo admin. */
    public function approve(Usuario $u, Solicitud $s): bool
    {
        if ($u->esCobrador()) return false;
        if ($s->seguro_exonerado) return $u->esAdministrador();
        if ($u->esAdministrador()) return true;
        return $u->esSupervisor() && $this->cubreArea($u, $s);
    }

    /** Reamortizar: cobrador dueño, supervisor del área o administrador. */
    public function reamortizar(Usuario $u, Solicitud $s): bool
    {
        if ($u->esAdministrador()) return true;
        return $this->cubreArea($u, $s);
    }

    /** Desembolsar: supervisor del área o administrador. */
    public function disburse(Usuario $u, Solicitud $s): bool
    {
        if ($u->esAdministrador()) return true;
        return $u->esSupervisor() && $this->cubreArea($u, $s);
    }

    /** Registrar pago: cobrador dueño, supervisor del área o administrador. */
    public function pay(Usuario $u, Solicitud $s): bool
    {
        if ($u->esAdministrador()) return true;
        return $this->cubreArea($u, $s);
    }
}

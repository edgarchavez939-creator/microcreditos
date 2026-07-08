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
     * ¿El supervisor cubre el área del crédito (o la del cliente)?
     * Consulta directa al pivot: inmune a fallos de carga de relaciones.
     */
    private function supervisorCubre(Usuario $u, Solicitud $s): bool
    {
        $areaCliente = DB::table('clientes')->where('id', $s->cliente_id)->value('area_id');
        $areas = array_values(array_filter([(int) $s->area_id, (int) $areaCliente]));
        if (empty($areas)) return false;

        return DB::table('usuario_area')
            ->where('usuario_id', (int) $u->id)
            ->whereIn('area_id', $areas)
            ->exists();
    }

    /**
     * ¿El cobrador es dueño del crédito? Vale el cobrador del crédito, el creador,
     * o el cobrador asignado al CLIENTE (cubre créditos antiguos con datos viejos).
     */
    private function cobradorCubre(Usuario $u, Solicitud $s): bool
    {
        if ((int) $s->cobrador_id === (int) $u->id) return true;
        if ((int) $s->created_by === (int) $u->id) return true;

        $cobradorCliente = DB::table('clientes')->where('id', $s->cliente_id)->value('cobrador_id');
        return $cobradorCliente !== null && (int) $cobradorCliente === (int) $u->id;
    }

    public function view(Usuario $u, Solicitud $s): bool
    {
        if ($u->esAdministrador()) return true;
        if ($u->esSupervisor())    return $this->supervisorCubre($u, $s);
        return $this->cobradorCubre($u, $s);
    }

    public function create(Usuario $u): bool
    {
        return in_array($u->rol, ['ADMINISTRADOR','SUPERVISOR','COBRADOR'], true);
    }

    public function update(Usuario $u, Solicitud $s): bool
    {
        if ($u->esAdministrador()) return true;
        return $this->cobradorCubre($u, $s) && $s->estado === 'BORRADOR';
    }

    /** Aprobar/rechazar: nunca cobrador. Exoneración: solo admin. */
    public function approve(Usuario $u, Solicitud $s): bool
    {
        if ($u->esCobrador()) return false;
        if ($s->seguro_exonerado) return $u->esAdministrador();
        if ($u->esAdministrador()) return true;
        return $u->esSupervisor() && $this->supervisorCubre($u, $s);
    }

    /** Reamortizar: cobrador dueño, supervisor del área o administrador. */
    public function reamortizar(Usuario $u, Solicitud $s): bool
    {
        if ($u->esAdministrador()) return true;
        if ($u->esSupervisor())    return $this->supervisorCubre($u, $s);
        return $this->cobradorCubre($u, $s);
    }

    /** Desembolsar: supervisor del área o administrador. */
    public function disburse(Usuario $u, Solicitud $s): bool
    {
        if ($u->esAdministrador()) return true;
        return $u->esSupervisor() && $this->supervisorCubre($u, $s);
    }

    /** Registrar pago: cobrador dueño, supervisor del área o administrador. */
    public function pay(Usuario $u, Solicitud $s): bool
    {
        if ($u->esAdministrador()) return true;
        if ($u->esSupervisor())    return $this->supervisorCubre($u, $s);
        return $this->cobradorCubre($u, $s);
    }
}

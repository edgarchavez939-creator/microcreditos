import { useState } from 'react';
import { useAuthStore } from '@/stores/auth';
import { LoginForm } from '@/features/auth/LoginForm';
import { SolicitudForm } from '@/features/solicitudes/SolicitudForm';
import { ReamortizacionPanel } from '@/features/renovaciones/ReamortizacionPanel';
import { Placeholder } from '@/components/Placeholder';
import type { Rol } from '@/types';

interface MenuItem { id: string; label: string; roles: Rol[]; }

// Menú maestro: cada item declara qué roles lo ven.
const MENU: MenuItem[] = [
  { id: 'solicitud',      label: 'Nueva solicitud',  roles: ['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR'] },
  { id: 'clientes',       label: 'Clientes',         roles: ['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR'] },
  { id: 'pagos',          label: 'Pagos',            roles: ['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR'] },
  { id: 'reamortizacion', label: 'Reamortización',   roles: ['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR'] },
  { id: 'mapa',           label: 'Mapa territorial', roles: ['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR'] },
  { id: 'aprobaciones',   label: 'Aprobaciones',     roles: ['ADMINISTRADOR', 'SUPERVISOR'] },
  { id: 'transferencias', label: 'Transferencias',   roles: ['ADMINISTRADOR', 'SUPERVISOR'] },
  { id: 'reportes',       label: 'Reportes',         roles: ['ADMINISTRADOR', 'SUPERVISOR'] },
  { id: 'usuarios',       label: 'Usuarios',         roles: ['ADMINISTRADOR'] },
  { id: 'parametros',     label: 'Parámetros',       roles: ['ADMINISTRADOR'] },
];

export function App() {
  const usuario = useAuthStore((s) => s.usuario);
  return usuario ? <AppShell /> : <LoginForm />;
}

function AppShell() {
  const usuario = useAuthStore((s) => s.usuario)!;
  const logout = useAuthStore((s) => s.logout);
  const visibles = MENU.filter((m) => m.roles.includes(usuario.rol));
  const [activo, setActivo] = useState(visibles[0]?.id ?? 'solicitud');

  return (
    <div className="min-h-screen bg-white">
      <header className="bg-brand text-white px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded bg-white/15 text-sm font-bold">M</span>
          <h1 className="font-semibold">Microcréditos</h1>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="text-right leading-tight">
            <div>{usuario.nombre}</div>
            <div className="text-white/70 text-xs">{usuario.rol}</div>
          </div>
          <button onClick={logout} className="rounded bg-white/15 px-2 py-1 hover:bg-white/25">Salir</button>
        </div>
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b bg-slate-50 px-2">
        {visibles.map((m) => (
          <button key={m.id} onClick={() => setActivo(m.id)}
            className={`whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
              activo === m.id ? 'border-brand text-brand' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            {m.label}
          </button>
        ))}
      </nav>

      <main className="p-4">
        <Pantalla id={activo} rol={usuario.rol} />
      </main>
    </div>
  );
}

function Pantalla({ id, rol }: { id: string; rol: Rol }) {
  switch (id) {
    case 'solicitud':
      return <PantallaSolicitud />;
    case 'reamortizacion':
      return <PantallaReamortizacion />;
    case 'clientes':
      return <Placeholder titulo="Clientes" descripcion="Gestión de clientes del territorio."
        permisos={rol === 'COBRADOR'
          ? ['Crear y editar tus clientes', 'Subir documentos (cédula, soportes)', 'Capturar GPS y ver en mapa']
          : ['Ver y reasignar clientes del área', 'Consultar cartera por cliente']} />;
    case 'pagos':
      return <Placeholder titulo="Pagos" descripcion="Registro de pagos y abonos a cuotas."
        permisos={['Registrar pago (efectivo, transferencia, Nequi, Daviplata)', 'Ver cuotas pendientes y saldo', 'Funciona offline y sincroniza al recuperar red']} />;
    case 'mapa':
      return <Placeholder titulo="Mapa territorial" descripcion="Visualización geográfica de clientes."
        permisos={['Ver clientes en el mapa con filtros (área, estado, mora)', 'Abrir ubicación en Google Maps', 'Navegar hacia el cliente']} />;
    case 'aprobaciones':
      return <Placeholder titulo="Aprobaciones" descripcion="Bandeja de créditos pendientes de aprobación."
        permisos={['Aprobar/rechazar dentro de tu límite (supervisor)', 'Exoneraciones de seguro requieren administrador', 'Ver detalle del crédito y del cliente']} />;
    case 'transferencias':
      return <Placeholder titulo="Transferencias" descripcion="Validación de pagos por transferencia."
        permisos={['Revisar comprobante y referencia', 'Aprobar o rechazar la transferencia', 'Queda registrado usuario, fecha y hora']} />;
    case 'reportes':
      return <Placeholder titulo="Reportes" descripcion="Indicadores y exportación."
        permisos={['Cartera vigente y vencida', 'Cobros por cobrador y por área', 'Exoneraciones de seguro', 'Exportar a Excel y PDF']} />;
    case 'usuarios':
      return <Placeholder titulo="Usuarios" descripcion="Administración de usuarios y áreas."
        permisos={['Crear/editar usuarios y asignar roles', 'Asignar áreas (relación muchos a muchos)', 'Activar/desactivar cuentas']} />;
    case 'parametros':
      return <Placeholder titulo="Parámetros" descripcion="Configuración del sistema."
        permisos={['Límites de aprobación por rol/área', 'Rango de seguro y reducción de cupo', 'Días de mora para castigo']} />;
    default:
      return <Placeholder titulo="Módulo" descripcion="Pantalla no encontrada." />;
  }
}

function PantallaSolicitud() {
  const [clienteId, setClienteId] = useState(1);
  return (
    <>
      <h2 className="text-lg font-semibold mb-3">Nueva solicitud</h2>
      <label className="mb-4 flex items-center gap-2 text-sm">
        Cliente #
        <input type="number" value={clienteId} onChange={(e) => setClienteId(Number(e.target.value))}
          className="w-24 rounded border px-2 py-1" />
      </label>
      <SolicitudForm clienteId={clienteId} areaId={1} />
    </>
  );
}

function PantallaReamortizacion() {
  const [solicitudId, setSolicitudId] = useState(1);
  const [clienteId, setClienteId] = useState(1);
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-3 text-sm">
        <label className="flex items-center gap-2">
          Crédito #
          <input type="number" value={solicitudId} onChange={(e) => setSolicitudId(Number(e.target.value))}
            className="w-24 rounded border px-2 py-1" />
        </label>
        <label className="flex items-center gap-2">
          Cliente #
          <input type="number" value={clienteId} onChange={(e) => setClienteId(Number(e.target.value))}
            className="w-24 rounded border px-2 py-1" />
        </label>
      </div>
      <ReamortizacionPanel solicitudId={solicitudId} clienteId={clienteId} />
    </>
  );
}

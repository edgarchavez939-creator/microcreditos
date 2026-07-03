import { useState } from 'react';
import { useAuthStore } from '@/stores/auth';
import { LoginForm } from '@/features/auth/LoginForm';
import { SolicitudForm } from '@/features/solicitudes/SolicitudForm';
import { ReamortizacionPanel } from '@/features/renovaciones/ReamortizacionPanel';
import { Placeholder } from '@/components/Placeholder';
import { ClientesPanel } from '@/features/clientes/ClientesPanel';
import { AprobacionesPanel } from '@/features/aprobaciones/AprobacionesPanel';
import { CarteraPanel } from '@/features/cartera/CarteraPanel';
import { DashboardPanel } from '@/features/dashboard/DashboardPanel';
import { UsuariosPanel } from '@/features/usuarios/UsuariosPanel';
import { ReportesPanel } from '@/features/reportes/ReportesPanel';
import { TransferenciasPanel } from '@/features/transferencias/TransferenciasPanel';
import { ParametrosPanel } from '@/features/parametros/ParametrosPanel';
import { MapaPanel } from '@/features/mapa/MapaPanel';
import { RutaPanel } from '@/features/ruta/RutaPanel';
import { CajaPanel } from '@/features/caja/CajaPanel';
import { Icon, type IconName } from '@/components/ui/icons';
import { APP_VERSION } from '@/lib/version';
import type { Rol } from '@/types';

interface MenuItem { id: string; label: string; icon: IconName; roles: Rol[] }

const MENU: MenuItem[] = [
  { id: 'inicio',         label: 'Inicio',           icon: 'inicio',         roles: ['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR'] },
  { id: 'ruta',           label: 'Ruta del día',     icon: 'ruta',           roles: ['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR'] },
  { id: 'caja',           label: 'Caja',             icon: 'caja',           roles: ['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR'] },
  { id: 'solicitud',      label: 'Nueva solicitud',  icon: 'solicitud',      roles: ['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR'] },
  { id: 'clientes',       label: 'Clientes',         icon: 'clientes',       roles: ['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR'] },
  { id: 'pagos',          label: 'Cartera y pagos',  icon: 'cartera',        roles: ['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR'] },
  { id: 'reamortizacion', label: 'Reamortización',   icon: 'reamortizacion', roles: ['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR'] },
  { id: 'mapa',           label: 'Mapa territorial', icon: 'mapa',           roles: ['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR'] },
  { id: 'aprobaciones',   label: 'Aprobaciones',     icon: 'aprobaciones',   roles: ['ADMINISTRADOR', 'SUPERVISOR'] },
  { id: 'transferencias', label: 'Transferencias',   icon: 'transferencias', roles: ['ADMINISTRADOR', 'SUPERVISOR'] },
  { id: 'reportes',       label: 'Reportes',         icon: 'reportes',       roles: ['ADMINISTRADOR', 'SUPERVISOR'] },
  { id: 'usuarios',       label: 'Usuarios',         icon: 'usuarios',       roles: ['ADMINISTRADOR'] },
  { id: 'parametros',     label: 'Parámetros',       icon: 'parametros',     roles: ['ADMINISTRADOR'] },
];

const ROL_LABEL: Record<Rol, string> = {
  ADMINISTRADOR: 'Administrador', SUPERVISOR: 'Supervisor', COBRADOR: 'Cobrador',
};

function iniciales(nombre: string) {
  return nombre.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
}

export function App() {
  const usuario = useAuthStore((s) => s.usuario);
  return usuario ? <AppShell /> : <LoginForm />;
}

function AppShell() {
  const usuario = useAuthStore((s) => s.usuario)!;
  const logout = useAuthStore((s) => s.logout);
  const visibles = MENU.filter((m) => m.roles.includes(usuario.rol));
  const [activo, setActivo] = useState(visibles[0]?.id ?? 'solicitud');
  const [drawer, setDrawer] = useState(false);

  const brand = (
    <div className="flex items-center gap-2.5 px-2">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 font-display text-lg font-bold text-white shadow-lift">M</div>
      <div className="leading-tight">
        <div className="font-display text-sm font-bold text-white">Microcréditos</div>
        <div className="text-[11px] text-slate-400">Gestión territorial</div>
      </div>
    </div>
  );

  const nav = (
    <nav className="flex flex-col gap-1">
      {visibles.map((m) => {
        const I = Icon[m.icon];
        const on = activo === m.id;
        return (
          <button key={m.id} onClick={() => { setActivo(m.id); setDrawer(false); }}
            className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              on ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}>
            <span className={on ? 'text-brand-300' : 'text-slate-400 group-hover:text-slate-200'}><I /></span>
            {m.label}
          </button>
        );
      })}
    </nav>
  );

  const userFooter = (
    <div className="flex items-center gap-3 rounded-xl bg-white/5 p-2.5">
      <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-500 text-sm font-semibold text-white">{iniciales(usuario.nombre)}</div>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm font-medium text-white">{usuario.nombre}</div>
        <div className="text-[11px] text-slate-400">{ROL_LABEL[usuario.rol]} · {APP_VERSION}</div>
      </div>
      <button onClick={logout} title="Cerrar sesión"
        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"><Icon.logout /></button>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <aside className="fixed inset-y-0 hidden w-64 flex-col bg-ink p-3 lg:flex">
        <div className="py-3">{brand}</div>
        <div className="mt-4 flex-1 overflow-y-auto">{nav}</div>
        <div className="pt-3">{userFooter}</div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between bg-ink px-4 py-3 lg:hidden">
        {brand}
        <button onClick={() => setDrawer(true)} className="rounded-lg p-2 text-slate-200 hover:bg-white/10"><Icon.menu /></button>
      </header>

      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/60 backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-ink p-3">
            <div className="flex items-center justify-between py-2">
              {brand}
              <button onClick={() => setDrawer(false)} className="rounded-lg p-2 text-slate-300 hover:bg-white/10"><Icon.close /></button>
            </div>
            <div className="mt-3 flex-1 overflow-y-auto">{nav}</div>
            <div className="pt-3">{userFooter}</div>
          </div>
        </div>
      )}

      <main className="flex-1 lg:pl-64">
        <div className="mx-auto max-w-5xl px-4 py-6 lg:px-8 lg:py-8">
          <Pantalla id={activo} />
        </div>
      </main>
    </div>
  );
}

function Pantalla({ id }: { id: string }) {
  switch (id) {
    case 'inicio':         return <DashboardPanel />;
    case 'ruta':           return <RutaPanel />;
    case 'caja':           return <CajaPanel />;
    case 'solicitud':      return <PantallaSolicitud />;
    case 'reamortizacion': return <PantallaReamortizacion />;
    case 'clientes':       return <ClientesPanel />;
    case 'aprobaciones':   return <AprobacionesPanel />;
    case 'pagos':          return <CarteraPanel />;
    case 'mapa':           return <MapaPanel />;
    case 'transferencias': return <TransferenciasPanel />;
    case 'reportes':       return <ReportesPanel />;
    case 'usuarios':       return <UsuariosPanel />;
    case 'parametros':     return <ParametrosPanel />;
    default:
      return <Placeholder titulo="Módulo" descripcion="Pantalla no encontrada." />;
  }
}

function PantallaSolicitud() {
  const [clienteId, setClienteId] = useState(1);
  return (
    <>
      <h2 className="mb-1 text-xl font-bold">Nueva solicitud</h2>
      <p className="mb-5 text-sm text-slate-500">Registra un crédito y revisa el cálculo antes de enviarlo a aprobación.</p>
      <label className="mb-4 flex items-center gap-2 text-sm">
        Cliente #
        <input type="number" value={clienteId} onChange={(e) => setClienteId(Number(e.target.value))}
          className="w-24 rounded-lg ring-1 ring-inset ring-slate-300 px-2 py-1" />
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
      <h2 className="mb-1 text-xl font-bold">Reamortización</h2>
      <p className="mb-5 text-sm text-slate-500">Renueva un crédito vigente conservando la trazabilidad con el crédito origen.</p>
      <div className="mb-4 flex flex-wrap gap-3 text-sm">
        <label className="flex items-center gap-2">Crédito #
          <input type="number" value={solicitudId} onChange={(e) => setSolicitudId(Number(e.target.value))}
            className="w-24 rounded-lg ring-1 ring-inset ring-slate-300 px-2 py-1" />
        </label>
        <label className="flex items-center gap-2">Cliente #
          <input type="number" value={clienteId} onChange={(e) => setClienteId(Number(e.target.value))}
            className="w-24 rounded-lg ring-1 ring-inset ring-slate-300 px-2 py-1" />
        </label>
      </div>
      <ReamortizacionPanel solicitudId={solicitudId} clienteId={clienteId} />
    </>
  );
}

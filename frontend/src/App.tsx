import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/ui/Logo';
import { useAuthStore } from '@/stores/auth';
import { useReporteUbicacion } from '@/lib/useReporteUbicacion';
import { ToggleTema } from '@/components/ui/ToggleTema';
import { useNavStore } from '@/stores/nav';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { BuscadorGlobal } from '@/components/ui/BuscadorGlobal';
import { AccionesRapidas } from '@/components/ui/AccionesRapidas';
import { LoginForm } from '@/features/auth/LoginForm';
import { CambioPasswordObligatorio } from '@/features/auth/CambioPasswordObligatorio';
import { Placeholder } from '@/components/Placeholder';
import { ClientesPanel } from '@/features/clientes/ClientesPanel';
import { AprobacionesPanel } from '@/features/aprobaciones/AprobacionesPanel';
import { CarteraPanel } from '@/features/cartera/CarteraPanel';
import { DashboardPanel } from '@/features/dashboard/DashboardPanel';
import { MigracionPanel } from '@/features/migracion/MigracionPanel';
import { empresaEnSesion } from '@/lib/marca';
import { AvisoSoporte } from '@/features/plataforma/AvisoSoporte';
import { EmpresasPanel } from '@/features/plataforma/EmpresasPanel';
import { MonitoreoPanel } from '@/features/plataforma/MonitoreoPanel';
import { InboxPanel } from '@/features/inbox/InboxPanel';
import { UsuariosPanel } from '@/features/usuarios/UsuariosPanel';
import { ReportesPanel } from '@/features/reportes/ReportesPanel';
import { TransferenciasPanel } from '@/features/transferencias/TransferenciasPanel';
import { ParametrosPanel } from '@/features/parametros/ParametrosPanel';
import { MapaPanel } from '@/features/mapa/MapaPanel';
import { MoraPanel } from '@/features/mora/MoraPanel';
import { RutaPanel } from '@/features/ruta/RutaPanel';
import { CajaPanel } from '@/features/caja/CajaPanel';
import { CajaGeneralPanel } from '@/features/cajageneral/CajaGeneralPanel';
import { EstadoCuentaPanel } from '@/features/estadocuenta/EstadoCuentaPanel';
import { PermisosPanel } from '@/features/permisos/PermisosPanel';
import { AdminFuncionalPanel } from '@/features/adminfuncional/AdminFuncionalPanel';
import { useMisPermisos } from '@/features/permisos/hooks';
import { BuscadorClienteSolicitud } from '@/features/solicitudes/BuscadorClienteSolicitud';
import { BuscadorReamortizacion } from '@/features/renovaciones/BuscadorReamortizacion';
import { Icon, type IconName } from '@/components/ui/icons';
import { APP_VERSION } from '@/lib/version';
import type { Rol } from '@/types';

interface MenuItem { id: string; label: string; icon: IconName; roles: Rol[] }

const MENU: MenuItem[] = [
  { id: 'inicio',         label: 'Inicio',           icon: 'inicio',         roles: ['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR'] },
  { id: 'inbox',          label: 'Bandeja',          icon: 'aprobaciones',   roles: ['ADMINISTRADOR', 'SUPERVISOR'] },
  { id: 'ruta',           label: 'Ruta y cobranza',  icon: 'ruta',           roles: ['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR'] },
  { id: 'caja',           label: 'Caja',             icon: 'caja',           roles: ['SUPERVISOR', 'COBRADOR'] },
  { id: 'caja-general',   label: 'Caja General',     icon: 'caja',           roles: ['ADMINISTRADOR'] },
  { id: 'estado-cuenta',  label: 'Estado de cuenta', icon: 'caja',           roles: ['ADMINISTRADOR'] },
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
  { id: 'permisos',       label: 'Permisos',         icon: 'permisos',       roles: ['ADMINISTRADOR'] },
  { id: 'migracion',      label: 'Migración',        icon: 'reportes',       roles: ['ADMINISTRADOR', 'SUPERVISOR'] },
  { id: 'empresas',       label: 'Empresas',         icon: 'usuarios',       roles: ['ADMIN_GLOBAL'] },
  { id: 'monitoreo',      label: 'Monitoreo',        icon: 'reportes',       roles: ['ADMIN_GLOBAL'] },
  { id: 'admin-funcional', label: 'Administración',  icon: 'parametros',     roles: ['ADMIN_FUNCIONAL'] },
];

const ROL_LABEL: Record<Rol, string> = {
  ADMINISTRADOR: 'Administrador', SUPERVISOR: 'Supervisor', COBRADOR: 'Cobrador', ADMIN_FUNCIONAL: 'Admin. Funcional', ADMIN_GLOBAL: 'Admin. Global KRYPTA',
};

// Módulos que el backend gobierna por permisos dinámicos. Un módulo del MENÚ que NO
// esté aquí se rige solo por el filtro de rol (evita que un módulo nuevo del frontend
// desaparezca porque el catálogo de permisos del backend todavía no lo liste).
/**
 * SECCIONES DEL MENÚ. Dieciocho módulos en una lista plana obligan a leerla
 * entera cada vez; agrupados por momento de uso, el ojo va directo al bloque.
 * El orden refleja la jornada real: primero lo que se usa en la calle.
 */
const SECCIONES: { titulo: string; modulos: string[] }[] = [
  { titulo: 'Mi día',        modulos: ['inicio', 'inbox', 'ruta', 'caja'] },
  { titulo: 'Cartera',       modulos: ['clientes', 'solicitud', 'pagos', 'aprobaciones', 'reamortizacion'] },
  { titulo: 'Territorio',    modulos: ['mapa', 'transferencias', 'caja-general', 'estado-cuenta'] },
  { titulo: 'Análisis',      modulos: ['reportes'] },
  { titulo: 'Administración',modulos: ['usuarios', 'permisos', 'parametros', 'migracion', 'admin-funcional'] },
  { titulo: 'Plataforma',    modulos: ['empresas', 'monitoreo'] },
];

const MODULOS_CATALOGADOS = new Set<string>([
  'inicio', 'inbox', 'ruta', 'caja', 'caja-general', 'estado-cuenta', 'solicitud',
  'aprobaciones', 'pagos', 'reamortizacion', 'transferencias', 'clientes', 'mapa',
  'reportes', 'usuarios', 'parametros', 'permisos', 'migracion', 'admin-funcional',
  // 'empresas' y 'monitoreo' NO se catalogan: los gobierna el rol global,
  // no la matriz de permisos de una empresa.
]);

function iniciales(nombre: string) {
  return nombre.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
}

export function App() {
  const usuario = useAuthStore((s) => s.usuario);
  // Contraseña pendiente de cambio: no se entra a la aplicación hasta definirla.
  // El servidor también lo impone, así que no basta con esquivar esta pantalla.
  if (usuario?.debe_cambiar_password) return <CambioPasswordObligatorio />;

  return usuario ? <AppShell /> : <LoginForm />;
}

function AppShell() {
  const usuario = useAuthStore((s) => s.usuario)!;
  const logout = useAuthStore((s) => s.logout);
  // Mapa en vivo: cobradores y supervisores reportan su ubicación cada 60s
  useReporteUbicacion(usuario.rol);
  const { data: permitidos } = useMisPermisos(true);
  // Primero por rol (defensa base) y luego por permisos dinámicos del servidor.
  // Mientras cargan los permisos, se usa solo el filtro por rol para no parpadear.
  // Salvaguarda: si el servidor devuelve permisos pero NO incluye un módulo (p. ej. uno
  // nuevo del frontend que el catálogo del backend aún no lista), no se oculta por eso;
  // se rige solo por el filtro de rol. Así un módulo nuevo nunca "parpadea y desaparece".
  const permitidosSet = permitidos ? new Set(permitidos) : null;
  const backendConoce = (id: string) =>
    !permitidosSet || permitidosSet.has(id) || !MODULOS_CATALOGADOS.has(id);
  // Los módulos de plataforma (empresas, monitoreo) son exclusivos del
  // Administrador Global: gobiernan el SaaS, no la operación de una empresa.
  const MODULOS_PLATAFORMA = ['empresas', 'monitoreo'];

  const visibles = MENU
    .filter((m) => {
      if (MODULOS_PLATAFORMA.includes(m.id)) return usuario.rol === 'ADMIN_GLOBAL';
      // El Administrador Funcional ve el resto de módulos de su empresa; lo que
      // puede HACER en cada uno lo gobierna el motor de permisos del servidor.
      if (usuario.rol === 'ADMIN_FUNCIONAL') return true;
      return m.roles.includes(usuario.rol);
    })
    .filter((m) => backendConoce(m.id));
  const moduloNav = useNavStore((s) => s.modulo);
  const setModuloNav = useNavStore((s) => s.setModulo);
  const activo = moduloNav;
  const setActivo = setModuloNav;
  const [drawer, setDrawer] = useState(false);
  const [buscador, setBuscador] = useState(false);

  // Atajo global Ctrl/Cmd + K para abrir el buscador
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setBuscador((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (visibles.length > 0 && !visibles.some((m) => m.id === activo)) {
      setActivo(visibles[0].id);
    }
  }, [visibles, activo]);

  const brand = (
    <div className="flex items-center gap-3 px-2">
      <Logo size={36} fondo="oscuro" className="rounded-xl shadow-[0_2px_8px_rgb(0_0_0/0.35)]" />
      <div className="leading-tight">
        <div className="font-display text-[15px] font-bold tracking-[-0.02em] text-white" data-marca-nombre>KRYPTA</div>
        <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/40">Business Suite</div>
      </div>
    </div>
  );

  const { data: badgesRaw } = useQuery({
    queryKey: ['tareas-badges'],
    queryFn: async () => (await api.get<{ data: Record<string, number> }>('/tareas/badges')).data.data,
    refetchInterval: 30_000, // el badge se actualiza solo cada 30s
  });

  // El badge de la Bandeja es el total de tareas pendientes (suma de los módulos).
  const badges: Record<string, number> | undefined = badgesRaw
    ? { ...badgesRaw, inbox: Object.values(badgesRaw).reduce((a, b) => a + b, 0) }
    : badgesRaw;

  const nav = (
    <nav className="flex flex-col gap-5">
      {SECCIONES.map((sec) => {
        const items = sec.modulos
          .map((id) => visibles.find((m) => m.id === id))
          .filter(Boolean) as typeof visibles;
        if (items.length === 0) return null;

        return (
          <div key={sec.titulo}>
            <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">
              {sec.titulo}
            </p>
            <div className="flex flex-col gap-0.5">
              {items.map((m) => {
                const I = Icon[m.icon];
                const on = activo === m.id;
                const pendientes = badges?.[m.id] ?? 0;
                return (
                  <button key={m.id} onClick={() => { setActivo(m.id); setDrawer(false); }}
                    aria-current={on ? 'page' : undefined}
                    className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm
                      transition-colors duration-rapido
                      ${on ? 'bg-white/[0.09] font-semibold text-white' : 'font-medium text-white/60 hover:bg-white/[0.05] hover:text-white/90'}`}>
                    {/* Marca de módulo activo: una barra vertical, no un bloque de color */}
                    <span className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full
                      bg-brand-400 transition-opacity duration-rapido ${on ? 'opacity-100' : 'opacity-0'}`} aria-hidden />
                    <span className={on ? 'text-brand-300' : 'text-white/45 group-hover:text-white/70'}><I /></span>
                    <span className="flex-1 text-left">{m.label}</span>
                    {pendientes > 0 && (
                      <span className="grid min-w-[1.3rem] place-items-center rounded-full bg-brand-500
                        px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                        {pendientes > 99 ? '99+' : pendientes}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );

  const userFooter = (
    <div className="flex items-center gap-3 rounded-xl bg-white/[0.06] p-2.5 ring-1 ring-white/[0.06]">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-krypta-suave text-sm font-bold text-white shadow-[0_2px_6px_rgb(0_0_0/0.3)]">
        {iniciales(usuario.nombre)}
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm font-semibold text-white">{usuario.nombre}</div>
        <div className="truncate text-[11px] text-white/40">
          {ROL_LABEL[usuario.rol]}
          {/* La empresa siempre a la vista: con varias empresas en la
              plataforma, saber en cuál se está trabajando evita errores. */}
          {empresaEnSesion()?.nombre && <> · {empresaEnSesion()!.nombre}</>}
        </div>
      </div>
      <button onClick={logout} title="Cerrar sesión" aria-label="Cerrar sesión"
        className="rounded-lg p-2 text-white/40 transition-colors duration-rapido hover:bg-white/10 hover:text-white">
        <Icon.logout />
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-surface-2 lg:flex">
      <AvisoSoporte />
      <aside className="fixed inset-y-0 hidden w-[15.5rem] flex-col bg-krypta-600 p-3
        shadow-[1px_0_0_rgb(255_255_255/0.06)] lg:flex">
        <div className="py-3">{brand}</div>
        <button onClick={() => setBuscador(true)}
          className="mt-4 flex w-full items-center gap-2.5 rounded-xl bg-white/[0.06] px-3 py-2.5
            text-sm text-white/50 ring-1 ring-white/[0.06] transition-colors duration-rapido
            hover:bg-white/[0.1] hover:text-white/80">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
          <span className="flex-1 text-left">Buscar cliente, crédito…</span>
          <kbd className="rounded border border-white/10 bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium">⌘K</kbd>
        </button>
        <div className="mt-5 flex-1 overflow-y-auto pb-2
          [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1
          [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/10">
          {nav}
        </div>
        <div className="space-y-2 border-t border-white/[0.07] pt-3">
          <div className="px-1"><ToggleTema /></div>
          {userFooter}
          <p className="px-1 text-center text-[10px] text-white/25">{APP_VERSION}</p>
        </div>
      </aside>

      <header className="sticky top-0 z-sticky flex items-center justify-between gap-2
        bg-krypta-600/95 px-4 py-3 backdrop-blur-md
        shadow-[0_1px_0_rgb(255_255_255/0.07)] lg:hidden">
        {brand}
        <div className="flex items-center gap-0.5">
          <button onClick={() => setBuscador(true)} aria-label="Buscar"
            className="grid h-touch w-touch place-items-center rounded-xl text-white/70
              transition-colors duration-rapido active:bg-white/10">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
          </button>
          <button onClick={() => setDrawer(true)} aria-label="Abrir menú"
            className="relative grid h-touch w-touch place-items-center rounded-xl text-white/70
              transition-colors duration-rapido active:bg-white/10">
            <Icon.menu />
            {/* Aviso de tareas pendientes también en móvil, donde el menú está oculto */}
            {!!badges?.inbox && (
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-brand-400 ring-2 ring-krypta-600" aria-hidden />
            )}
          </button>
        </div>
      </header>

      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-krypta-900/60 backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[17rem] animate-slide-in-right flex-col bg-krypta-600 p-3">
            <div className="flex items-center justify-between py-2">
              {brand}
              <button onClick={() => setDrawer(false)} className="rounded-lg p-2 text-slate-300 hover:bg-white/10"><Icon.close /></button>
            </div>
            <div className="mt-5 flex-1 overflow-y-auto pb-2">{nav}</div>
            <div className="pt-3 space-y-2">
              <div className="px-1"><ToggleTema /></div>
              {userFooter}
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 lg:pl-[15.5rem]">
        <div className="mx-auto max-w-5xl px-4 py-6 lg:px-8 lg:py-8">
          {activo !== 'inicio' && (
            <Breadcrumb
              modulo={MENU.find((m) => m.id === activo)?.label ?? activo}
              onInicio={() => setActivo('inicio')}
            />
          )}
          <Pantalla id={activo} />
        </div>
      </main>

      <BuscadorGlobal abierto={buscador} onCerrar={() => setBuscador(false)} />
      <AccionesRapidas />
    </div>
  );
}

function Pantalla({ id }: { id: string }) {
  switch (id) {
    case 'inicio':         return <DashboardPanel />;
    case 'inbox':          return <InboxPanel />;
    case 'migracion':      return <MigracionPanel />;
    case 'empresas':       return <EmpresasPanel />;
    case 'monitoreo':      return <MonitoreoPanel />;
    case 'ruta':           return <RutaPanel />;
    case 'caja':           return <CajaPanel />;
    case 'caja-general':   return <CajaGeneralPanel />;
    case 'estado-cuenta':  return <EstadoCuentaPanel />;
    case 'solicitud':      return <PantallaSolicitud />;
    case 'reamortizacion': return <PantallaReamortizacion />;
    case 'clientes':       return <ClientesPanel />;
    case 'aprobaciones':   return <AprobacionesPanel />;
    case 'pagos':          return <CarteraPanel />;
    case 'mapa':           return <MapaPanel />;
    case 'mora':           return <MoraPanel />;
    case 'transferencias': return <TransferenciasPanel />;
    case 'reportes':       return <ReportesPanel />;
    case 'usuarios':       return <UsuariosPanel />;
    case 'parametros':     return <ParametrosPanel />;
    case 'permisos':       return <PermisosPanel />;
    case 'admin-funcional': return <AdminFuncionalPanel />;
    default:
      return <Placeholder titulo="Módulo" descripcion="Pantalla no encontrada." />;
  }
}

function PantallaSolicitud() {
  return (
    <>
      <h2 className="mb-1 text-xl font-bold">Nueva solicitud</h2>
      <p className="mb-5 text-sm text-slate-500">Busca al cliente por su número de documento para evitar duplicados.</p>
      <BuscadorClienteSolicitud />
    </>
  );
}

function PantallaReamortizacion() {
  return (
    <>
      <h2 className="mb-1 text-xl font-bold">Reamortización</h2>
      <p className="mb-5 text-sm text-slate-500">Ingresa el número del crédito y el sistema cargará todo automáticamente.</p>
      <BuscadorReamortizacion />
    </>
  );
}

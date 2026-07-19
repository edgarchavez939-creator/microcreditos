import { useState, type ReactNode } from 'react';
import { useNavStore } from '@/stores/nav';
import { useAuthStore } from '@/stores/auth';

/**
 * ACCIONES RÁPIDAS — botón flotante (FAB) con las acciones frecuentes del rol.
 * Permite ejecutar tareas comunes desde cualquier pantalla sin navegar por el menú.
 * Las acciones se filtran según el rol del usuario.
 */
export function AccionesRapidas() {
  const [abierto, setAbierto] = useState(false);
  const irA = useNavStore((s) => s.irA);
  const rol = useAuthStore((s) => s.usuario?.rol);

  const acciones: { label: string; modulo: string; icon: ReactNode; roles: string[] }[] = [
    { label: 'Registrar pago', modulo: 'pagos', icon: <IcoPago />, roles: ['COBRADOR', 'SUPERVISOR', 'ADMINISTRADOR'] },
    { label: 'Nueva solicitud', modulo: 'solicitud', icon: <IcoDoc />, roles: ['COBRADOR', 'SUPERVISOR', 'ADMINISTRADOR'] },
    { label: 'Nuevo cliente', modulo: 'clientes', icon: <IcoUser />, roles: ['COBRADOR', 'SUPERVISOR', 'ADMINISTRADOR'] },
    { label: 'Ruta del día', modulo: 'ruta', icon: <IcoRuta />, roles: ['COBRADOR', 'SUPERVISOR'] },
    { label: 'Aprobaciones', modulo: 'aprobaciones', icon: <IcoCheck />, roles: ['SUPERVISOR', 'ADMINISTRADOR'] },
  ];

  const visibles = acciones.filter((a) => !rol || a.roles.includes(rol));
  if (visibles.length === 0) return null;

  const ir = (modulo: string) => { irA(modulo); setAbierto(false); };

  return (
    <>
      {/* Fondo para cerrar al tocar fuera */}
      {abierto && <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} />}

      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
        {abierto && (
          <div className="mb-1 flex flex-col items-end gap-2">
            {visibles.map((a) => (
              <button key={a.modulo} onClick={() => ir(a.modulo)}
                className="animate-fade-in-scale flex items-center gap-2 rounded-full bg-surface py-2 pl-4 pr-3 text-sm font-medium text-content-strong shadow-lift ring-1 ring-border-token transition hover:bg-surface-3">
                {a.label}
                <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-100 text-brand-700">{a.icon}</span>
              </button>
            ))}
          </div>
        )}
        <button onClick={() => setAbierto((v) => !v)} aria-label="Acciones rápidas"
          className={`grid h-14 w-14 place-items-center rounded-full bg-brand-500 text-white shadow-lift transition hover:bg-brand-600 ${abierto ? 'rotate-45' : ''}`}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </div>
    </>
  );
}

const IcoPago = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>;
const IcoDoc = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>;
const IcoUser = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
const IcoRuta = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="19" r="3" /><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" /><circle cx="18" cy="5" r="3" /></svg>;
const IcoCheck = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>;

import { useTemaStore, type Tema } from '@/stores/tema';
import type { ReactNode } from 'react';

/**
 * Selector de tema del Design System: claro / oscuro / sistema.
 * Tres botones segmentados con icono; el activo se resalta.
 */
export function ToggleTema({ compact = false }: { compact?: boolean }) {
  const tema = useTemaStore((s) => s.tema);
  const setTema = useTemaStore((s) => s.setTema);

  const opciones: { v: Tema; label: string; icon: ReactNode }[] = [
    { v: 'light', label: 'Claro', icon: <IconSol /> },
    { v: 'dark', label: 'Oscuro', icon: <IconLuna /> },
    { v: 'system', label: 'Auto', icon: <IconSistema /> },
  ];

  return (
    <div className="inline-flex items-center gap-0.5 rounded-xl bg-surface-3 p-0.5" role="group" aria-label="Tema de la aplicación">
      {opciones.map((o) => (
        <button
          key={o.v}
          onClick={() => setTema(o.v)}
          aria-pressed={tema === o.v}
          title={o.label}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
            tema === o.v ? 'bg-surface text-content-strong shadow-sm' : 'text-content-muted hover:text-content'
          }`}
        >
          {o.icon}
          {!compact && <span>{o.label}</span>}
        </button>
      ))}
    </div>
  );
}

function IconSol() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
function IconLuna() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}
function IconSistema() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" />
    </svg>
  );
}

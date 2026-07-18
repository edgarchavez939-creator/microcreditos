import type { ReactNode } from 'react';

interface Props {
  icono?: ReactNode;
  titulo: string;
  descripcion?: string;
  accion?: { label: string; onClick: () => void };
}

/** Bloque centrado y con diseño para pantallas sin datos. */
export function EstadoVacio({ icono, titulo, descripcion, accion }: Props) {
  return (
    <div className="animate-fade-in flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border-token bg-gradient-to-b from-slate-50/80 to-white px-6 py-14 text-center">
      <div className="relative mb-4">
        {/* Halo decorativo detrás del ícono */}
        <div className="absolute inset-0 -z-10 animate-pulse rounded-full bg-brand-100/40 blur-xl" />
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-surface text-brand-400 shadow-card ring-1 ring-border-token">
          {icono ?? <IconoDefecto />}
        </div>
      </div>
      <p className="text-base font-semibold text-content">{titulo}</p>
      {descripcion && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-content-muted">{descripcion}</p>}
      {accion && (
        <button onClick={accion.onClick} className="btn-primary btn-sm mt-5">
          {accion.label}
        </button>
      )}
    </div>
  );
}

function IconoDefecto() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-7 w-7">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 14h8" strokeLinecap="round" />
    </svg>
  );
}

/** Íconos temáticos para reutilizar en distintos estados vacíos. */
export const IconosVacio = {
  documento: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-7 w-7">
      <path d="M14 3v5h5" /><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-5z" strokeLinejoin="round" />
    </svg>
  ),
  cartera: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-7 w-7">
      <rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M7 15h4" strokeLinecap="round" />
    </svg>
  ),
  usuarios: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-7 w-7">
      <circle cx="9" cy="8" r="3" /><path d="M4 20c0-3 2.5-5 5-5s5 2 5 5" strokeLinecap="round" /><path d="M17 11a3 3 0 0 0 0-6" strokeLinecap="round" />
    </svg>
  ),
  aprobacion: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-7 w-7">
      <circle cx="12" cy="12" r="9" /><path d="M8 12l2.5 2.5L16 9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  transferencia: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-7 w-7">
      <path d="M7 10l-3 3 3 3M4 13h16M17 8l3-3-3-3M20 5H4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  reporte: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-7 w-7">
      <path d="M3 3v18h18" strokeLinecap="round" /><path d="M7 14l3-3 3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  busqueda: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-7 w-7">
      <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" strokeLinecap="round" />
    </svg>
  ),
};

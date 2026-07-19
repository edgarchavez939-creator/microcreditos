import { useEffect, type ReactNode } from 'react';

/**
 * DRAWER (panel lateral) del Design System.
 * Se desliza desde la derecha manteniendo el contexto de la pantalla anterior,
 * en lugar de navegar a una página nueva. Cierra con Escape, clic en el fondo
 * o el botón. Bloquea el scroll del fondo mientras está abierto.
 */
export function Drawer({ abierto, onCerrar, titulo, children, footer, ancho = 'md' }:
  { abierto: boolean; onCerrar: () => void; titulo?: ReactNode; children: ReactNode; footer?: ReactNode; ancho?: 'sm' | 'md' | 'lg' }) {
  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  const anchos = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-xl' };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      {/* Fondo */}
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onCerrar} />
      {/* Panel */}
      <div className={`relative flex h-full w-full ${anchos[ancho]} animate-slide-in-right flex-col bg-surface shadow-lift`}>
        <div className="flex items-center justify-between border-b border-border-token px-5 py-4">
          <div className="min-w-0 font-display text-base font-bold text-content-strong">{titulo}</div>
          <button onClick={onCerrar} aria-label="Cerrar panel"
            className="grid h-8 w-8 place-items-center rounded-lg text-content-muted transition hover:bg-surface-3 hover:text-content">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="border-t border-border-token px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

type ToastTipo = 'exito' | 'error' | 'info';
interface Toast { id: number; tipo: ToastTipo; mensaje: string }

interface ToastCtx {
  exito: (m: string) => void;
  error: (m: string) => void;
  info: (m: string) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

let contador = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const quitar = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((tipo: ToastTipo, mensaje: string) => {
    const id = ++contador;
    setToasts((prev) => [...prev, { id, tipo, mensaje }]);
  }, []);

  const api: ToastCtx = {
    exito: (m) => push('exito', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
  };

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-3 sm:items-end sm:pr-4">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onCerrar={() => quitar(t.id)} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

function ToastItem({ toast, onCerrar }: { toast: Toast; onCerrar: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Entrada suave
    const tIn = requestAnimationFrame(() => setVisible(true));
    // Auto-cierre a los 3.5s (con animación de salida)
    const tOut = setTimeout(() => setVisible(false), 3500);
    const tRemove = setTimeout(onCerrar, 3800);
    return () => { cancelAnimationFrame(tIn); clearTimeout(tOut); clearTimeout(tRemove); };
  }, [onCerrar]);

  const estilos: Record<ToastTipo, { barra: string; icono: ReactNode }> = {
    exito: {
      barra: 'bg-money-500',
      icono: (
        <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5 text-money-600">
          <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.12" />
          <path d="M6 10.5l2.5 2.5L14 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    error: {
      barra: 'bg-rose-500',
      icono: (
        <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5 text-rose-600">
          <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.12" />
          <path d="M7 7l6 6M13 7l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      ),
    },
    info: {
      barra: 'bg-brand-500',
      icono: (
        <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5 text-brand-600">
          <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.12" />
          <path d="M10 9v4.5M10 6.5h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      ),
    },
  };

  const s = estilos[toast.tipo];

  return (
    <div
      className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-xl bg-white shadow-lift ring-1 ring-slate-200 transition-all duration-300 ${
        visible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
      }`}
      role="status"
    >
      <div className={`h-full w-1 self-stretch ${s.barra}`} />
      <div className="flex flex-1 items-start gap-2.5 py-3 pr-2">
        <span className="mt-0.5 shrink-0">{s.icono}</span>
        <p className="flex-1 text-sm text-ink">{toast.mensaje}</p>
        <button onClick={onCerrar} aria-label="Cerrar" className="shrink-0 text-slate-300 hover:text-slate-500">
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
            <path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast debe usarse dentro de ToastProvider');
  return ctx;
}

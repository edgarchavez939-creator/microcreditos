import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { useNavStore } from '@/stores/nav';

interface Resultado {
  tipo: 'cliente' | 'credito' | 'usuario' | 'producto';
  id: number;
  cliente_id?: number;
  titulo: string;
  detalle: string;
}

const TIPO_META: Record<string, { label: string; color: string }> = {
  cliente:  { label: 'Cliente', color: 'bg-brand-100 text-brand-700' },
  credito:  { label: 'Crédito', color: 'bg-money-100 text-money-700' },
  usuario:  { label: 'Usuario', color: 'bg-amber-100 text-amber-800' },
  producto: { label: 'Producto', color: 'bg-sky-100 text-sky-700' },
};

/**
 * BUSCADOR GLOBAL (command palette). Accesible con Ctrl/Cmd+K desde cualquier
 * pantalla o desde el botón del menú. Busca clientes, créditos, usuarios y
 * productos, y navega al resultado. Los resultados respetan el alcance del rol.
 */
export function BuscadorGlobal({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const irA = useNavStore((s) => s.irA);

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  // Foco al abrir, limpiar al cerrar
  useEffect(() => {
    if (abierto) { setTimeout(() => inputRef.current?.focus(), 50); }
    else { setQ(''); setQDebounced(''); setSel(0); }
  }, [abierto]);

  const { data: resultados, isFetching } = useQuery({
    queryKey: ['busqueda-global', qDebounced],
    queryFn: async () => (await api.get<{ data: Resultado[] }>('/busqueda-global', { params: { q: qDebounced } })).data.data,
    enabled: abierto && qDebounced.trim().length >= 2,
  });

  useEffect(() => { setSel(0); }, [resultados]);

  if (!abierto) return null;

  const lista = resultados ?? [];

  const abrir = (r: Resultado) => {
    // Navegar al módulo correspondiente
    if (r.tipo === 'cliente') irA('clientes');
    else if (r.tipo === 'credito') irA('pagos');
    else if (r.tipo === 'usuario') irA('usuarios');
    else if (r.tipo === 'producto') irA('admin-funcional');
    onCerrar();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, lista.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter' && lista[sel]) { e.preventDefault(); abrir(lista[sel]); }
    else if (e.key === 'Escape') { onCerrar(); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onCerrar} />
      <div className="relative w-full max-w-xl animate-fade-in-scale overflow-hidden rounded-2xl bg-surface shadow-lift ring-1 ring-border-token">
        {/* Campo de búsqueda */}
        <div className="flex items-center gap-3 border-b border-border-token px-4 py-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-content-muted"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Buscar clientes, créditos, usuarios…"
            className="w-full bg-transparent text-sm text-content-strong placeholder:text-content-muted focus:outline-none"
          />
          {isFetching && <span className="loader shrink-0" />}
          <kbd className="hidden shrink-0 rounded bg-surface-3 px-1.5 py-0.5 text-[10px] text-content-muted sm:block">ESC</kbd>
        </div>

        {/* Resultados */}
        <div className="max-h-[50vh] overflow-y-auto">
          {qDebounced.trim().length < 2 ? (
            <p className="px-4 py-8 text-center text-sm text-content-muted">Escribe al menos 2 caracteres para buscar.</p>
          ) : lista.length === 0 && !isFetching ? (
            <p className="px-4 py-8 text-center text-sm text-content-muted">Sin resultados para “{qDebounced}”.</p>
          ) : (
            <ul className="py-1">
              {lista.map((r, i) => {
                const meta = TIPO_META[r.tipo];
                return (
                  <li key={`${r.tipo}-${r.id}`}>
                    <button
                      onClick={() => abrir(r)}
                      onMouseEnter={() => setSel(i)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${i === sel ? 'bg-surface-3' : ''}`}
                    >
                      <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${meta.color}`}>{meta.label}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-content-strong">{r.titulo}</span>
                        <span className="block truncate text-xs text-content-muted">{r.detalle}</span>
                      </span>
                      <span className="shrink-0 text-content-muted">→</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-border-token px-4 py-2 text-[11px] text-content-muted">
          <span><kbd className="rounded bg-surface-3 px-1">↑</kbd> <kbd className="rounded bg-surface-3 px-1">↓</kbd> navegar</span>
          <span><kbd className="rounded bg-surface-3 px-1">↵</kbd> abrir</span>
        </div>
      </div>
    </div>
  );
}

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { AppButton } from './primitivos';

/**
 * ESTRUCTURA Y CONTENEDORES.
 *
 * En móvil la tabla clásica no funciona: 12 columnas en 380px son ilegibles.
 * Por eso AppTable cambia de forma según el ancho —tarjetas apiladas en el
 * teléfono, tabla real en escritorio— sin que la pantalla que la usa tenga
 * que saber nada de eso.
 */

// ─────────────────────────────────────────── AppTable

export interface ColumnaTabla<T> {
  clave: string;
  titulo: string;
  render?: (fila: T) => ReactNode;
  alinear?: 'izq' | 'der' | 'centro';
  ordenable?: boolean;
  /** En móvil solo se muestran las columnas marcadas como principales. */
  principal?: boolean;
  ancho?: string;
}

export function AppTable<T extends Record<string, unknown>>({
  columnas, filas, vacio, cargando, onFila, claveFila, densa,
}: {
  columnas: ColumnaTabla<T>[];
  filas: T[];
  vacio?: ReactNode;
  cargando?: boolean;
  onFila?: (fila: T) => void;
  claveFila?: (fila: T, i: number) => string | number;
  densa?: boolean;
}) {
  const [orden, setOrden] = useState<{ clave: string; dir: 'asc' | 'desc' } | null>(null);

  const ordenadas = useMemo(() => {
    if (!orden) return filas;
    return [...filas].sort((a, b) => {
      const va = a[orden.clave]; const vb = b[orden.clave];
      const na = Number(va); const nb = Number(vb);
      const cmp = !Number.isNaN(na) && !Number.isNaN(nb) && va !== '' && vb !== '' && va != null && vb != null
        ? na - nb
        : String(va ?? '').localeCompare(String(vb ?? ''), 'es');
      return orden.dir === 'asc' ? cmp : -cmp;
    });
  }, [filas, orden]);

  const alinea = (a?: string) => a === 'der' ? 'text-right' : a === 'centro' ? 'text-center' : 'text-left';

  const alternarOrden = (c: ColumnaTabla<T>) => {
    if (!c.ordenable) return;
    setOrden(
      orden?.clave === c.clave && orden.dir === 'asc' ? { clave: c.clave, dir: 'desc' }
      : orden?.clave === c.clave && orden.dir === 'desc' ? null
      : { clave: c.clave, dir: 'asc' }
    );
  };

  if (cargando) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Cargando datos">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-xl bg-surface-3" />
        ))}
      </div>
    );
  }

  if (ordenadas.length === 0) {
    return <div className="py-10 text-center text-sm text-content-muted">{vacio ?? 'No hay registros.'}</div>;
  }

  const principales = columnas.filter((c) => c.principal !== false);

  return (
    <>
      {/* MÓVIL: cada fila es una tarjeta legible de un vistazo */}
      <div className="space-y-2 md:hidden">
        {ordenadas.map((f, i) => (
          <div
            key={claveFila?.(f, i) ?? i}
            onClick={onFila ? () => onFila(f) : undefined}
            className={`rounded-xl bg-surface p-3 ring-1 ring-border-token
              ${onFila ? 'cursor-pointer active:bg-surface-3' : ''}`}
          >
            {principales.map((c, j) => (
              <div key={c.clave} className={`flex items-baseline justify-between gap-3 ${j > 0 ? 'mt-1' : ''}`}>
                <span className="text-xs text-content-muted">{c.titulo}</span>
                <span className={`min-w-0 text-sm ${j === 0 ? 'font-semibold text-content-strong' : 'text-content'}`}>
                  {c.render ? c.render(f) : String(f[c.clave] ?? '—')}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* ESCRITORIO: tabla con encabezado fijo */}
      <div className="hidden max-h-[65vh] overflow-auto rounded-xl ring-1 ring-border-token md:block">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-sticky bg-surface shadow-[0_1px_0_rgb(var(--border))]">
            <tr>
              {columnas.map((c) => (
                <th key={c.clave} scope="col" style={c.ancho ? { width: c.ancho } : undefined}
                  className={`whitespace-nowrap px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-content-muted ${alinea(c.alinear)}`}>
                  {c.ordenable ? (
                    <button onClick={() => alternarOrden(c)}
                      className="inline-flex items-center gap-1 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
                      aria-label={`Ordenar por ${c.titulo}`}>
                      {c.titulo}
                      <span className="text-[10px]" aria-hidden>
                        {orden?.clave === c.clave ? (orden.dir === 'asc' ? '▲' : '▼') : '⇅'}
                      </span>
                    </button>
                  ) : c.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((f, i) => (
              <tr key={claveFila?.(f, i) ?? i}
                onClick={onFila ? () => onFila(f) : undefined}
                className={`border-t border-border-token odd:bg-surface-2/40
                  ${onFila ? 'cursor-pointer hover:bg-surface-3' : ''}`}>
                {columnas.map((c) => (
                  <td key={c.clave} className={`px-3 ${densa ? 'py-1.5' : 'py-2.5'} ${alinea(c.alinear)}`}>
                    {c.render ? c.render(f) : String(f[c.clave] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─────────────────────────────────────────── AppTabs

export function AppTabs({ pestanas, activa, onCambiar }: {
  pestanas: { id: string; titulo: string; badge?: number }[];
  activa: string;
  onCambiar: (id: string) => void;
}) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto rounded-xl bg-surface-3 p-1">
      {pestanas.map((p) => {
        const on = p.id === activa;
        return (
          <button key={p.id} role="tab" aria-selected={on}
            onClick={() => onCambiar(p.id)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium
              transition-colors duration-rapido
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600
              ${on ? 'bg-surface text-content-strong shadow-[0_1px_2px_rgb(24_28_48/0.04)]' : 'text-content-muted hover:text-content'}`}>
            {p.titulo}
            {p.badge !== undefined && p.badge > 0 && (
              <span className={`rounded-full px-1.5 text-[10px] font-semibold tabular-nums
                ${on ? 'bg-brand-100 text-brand-700' : 'bg-surface text-content-muted'}`}>
                {p.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────── AppModal

export function AppModal({ abierto, onCerrar, titulo, descripcion, children, acciones, ancho = 'md' }: {
  abierto: boolean; onCerrar: () => void;
  titulo: string; descripcion?: string; children?: ReactNode; acciones?: ReactNode;
  ancho?: 'sm' | 'md' | 'lg';
}) {
  const caja = useRef<HTMLDivElement>(null);

  // Escape cierra; el foco entra al diálogo al abrirse.
  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    document.addEventListener('keydown', onKey);
    caja.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  const anchos = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' };

  return (
    <div className="fixed inset-0 z-modal flex items-end justify-center bg-ink/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onCerrar}>
      <div
        ref={caja}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${anchos[ancho]} animate-entrada-suave rounded-t-3xl bg-surface shadow-lift
          outline-none sm:rounded-2xl`}
      >
        <div className="px-5 pt-5">
          <h2 className="font-display text-base font-semibold text-content-strong">{titulo}</h2>
          {descripcion && <p className="mt-1 text-sm text-content-muted">{descripcion}</p>}
        </div>

        {children && <div className="px-5 py-4">{children}</div>}

        <div className="flex flex-col-reverse gap-2 px-5 pb-5 sm:flex-row sm:justify-end">
          {acciones ?? <AppButton tono="secundario" onClick={onCerrar}>Cerrar</AppButton>}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────── AppAccordion

export function AppAccordion({ secciones, abiertaInicial }: {
  secciones: { id: string; titulo: string; resumen?: ReactNode; contenido: ReactNode }[];
  abiertaInicial?: string;
}) {
  const [abierta, setAbierta] = useState<string | null>(abiertaInicial ?? null);

  return (
    <div className="divide-y divide-border-token overflow-hidden rounded-2xl bg-surface ring-1 ring-border-token">
      {secciones.map((s) => {
        const on = abierta === s.id;
        return (
          <div key={s.id}>
            <button
              onClick={() => setAbierta(on ? null : s.id)}
              aria-expanded={on}
              className="flex min-h-touch w-full items-center justify-between gap-3 px-4 py-3 text-left
                hover:bg-surface-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-content-strong">{s.titulo}</span>
                {s.resumen && <span className="block text-xs text-content-muted">{s.resumen}</span>}
              </span>
              <span className={`shrink-0 text-content-muted transition-transform duration-rapido ${on ? 'rotate-180' : ''}`} aria-hidden>
                ⌄
              </span>
            </button>
            {on && <div className="animate-entrada-suave px-4 pb-4">{s.contenido}</div>}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────── AppPagination

export function AppPagination({ pagina, totalPaginas, onCambiar, totalRegistros }: {
  pagina: number; totalPaginas: number; onCambiar: (p: number) => void; totalRegistros?: number;
}) {
  if (totalPaginas <= 1) return null;

  return (
    <nav className="flex items-center justify-between gap-3 pt-3" aria-label="Paginación">
      <p className="text-xs text-content-muted">
        Página <span className="tabular-nums font-medium text-content">{pagina}</span> de{' '}
        <span className="tabular-nums">{totalPaginas}</span>
        {totalRegistros !== undefined && <> · {totalRegistros.toLocaleString('es-CO')} registros</>}
      </p>
      <div className="flex gap-2">
        <AppButton talla="sm" tono="secundario" disabled={pagina <= 1} onClick={() => onCambiar(pagina - 1)}>
          Anterior
        </AppButton>
        <AppButton talla="sm" tono="secundario" disabled={pagina >= totalPaginas} onClick={() => onCambiar(pagina + 1)}>
          Siguiente
        </AppButton>
      </div>
    </nav>
  );
}

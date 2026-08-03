import { ReactNode } from 'react';
import { money, fecha as fmtFecha, MONEY_DIVISOR } from '@/lib/format';

/**
 * PRESENTACIÓN DE DATOS.
 *
 * En un sistema financiero el número ES el contenido, así que recibe el mismo
 * cuidado que la tipografía de un titular:
 *  - cifras tabulares, para que las columnas se alineen dígito con dígito;
 *  - jerarquía por tamaño, no por color, para que se lea bajo el sol;
 *  - el signo del dinero nunca compite con la magnitud.
 */

// ─────────────────────────────────────────── AppMoney

type PesoVisual = 'normal' | 'destacado' | 'titular';

/**
 * Importe monetario. Recibe SIEMPRE pesos reales (el sistema calcula en pesos);
 * la presentación en miles es cosa de format.money.
 *
 * `signo`: 'auto' pinta en rojo los negativos —un faltante de caja debe verse
 * como faltante sin necesidad de leer el signo.
 */
export function AppMoney({
  valor, peso = 'normal', signo = 'auto', escala, className = '',
}: {
  valor: number | string | null | undefined;
  peso?: PesoVisual;
  signo?: 'auto' | 'neutro' | 'positivo' | 'negativo';
  escala?: boolean;
  className?: string;
}) {
  const n = typeof valor === 'string' ? parseFloat(valor) : (valor ?? 0);
  const num = Number.isNaN(n) ? 0 : n;

  const pesos: Record<PesoVisual, string> = {
    normal:    'text-dato-sm font-medium',
    destacado: 'text-dato font-semibold',
    titular:   'font-display text-dato-xl font-bold',
  };

  const color =
    signo === 'neutro'   ? 'text-content-strong'
    : signo === 'positivo' ? 'text-estado-activo'
    : signo === 'negativo' ? 'text-estado-mora'
    : num < 0              ? 'text-estado-mora'
    : 'text-content-strong';

  return (
    <span className={`tabular-nums ${pesos[peso]} ${color} ${className}`}>
      {money(num)}
      {escala && (
        <span className="ml-1 align-baseline text-[0.65em] font-normal text-content-muted">
          ×{MONEY_DIVISOR.toLocaleString('es-CO')}
        </span>
      )}
    </span>
  );
}

// ─────────────────────────────────────────── AppDate

export function AppDate({ valor, conHora, relativo, className = '' }: {
  valor: string | Date | null | undefined; conHora?: boolean; relativo?: boolean; className?: string;
}) {
  if (!valor) return <span className={`text-content-muted ${className}`}>—</span>;

  const d = typeof valor === 'string' ? new Date(valor) : valor;
  if (Number.isNaN(d.getTime())) return <span className={`text-content-muted ${className}`}>—</span>;

  if (relativo) {
    const dias = Math.round((Date.now() - d.getTime()) / 86_400_000);
    const texto =
      dias === 0 ? 'Hoy' : dias === 1 ? 'Ayer' : dias === -1 ? 'Mañana'
      : dias > 1 ? `Hace ${dias} días` : `En ${Math.abs(dias)} días`;
    return <span className={`tabular-nums ${className}`} title={d.toLocaleString('es-CO')}>{texto}</span>;
  }

  return (
    <span className={`tabular-nums ${className}`} title={d.toLocaleString('es-CO')}>
      {fmtFecha(d.toISOString())}
      {conHora && ` · ${d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`}
    </span>
  );
}

// ─────────────────────────────────────────── AppStatCard

/**
 * Indicador. El dato manda: cifra grande arriba, etiqueta discreta debajo.
 * `tendencia` solo aparece cuando hay comparación real que hacer.
 */
export function AppStatCard({
  etiqueta, valor, detalle, tono = 'neutro', icono, tendencia, onClick,
}: {
  etiqueta: string;
  valor: ReactNode;
  detalle?: ReactNode;
  tono?: 'neutro' | 'activo' | 'pendiente' | 'mora' | 'info';
  icono?: ReactNode;
  tendencia?: { valor: number; etiqueta?: string };
  onClick?: () => void;
}) {
  const tonos = {
    neutro:    'text-content-strong',
    activo:    'text-estado-activo',
    pendiente: 'text-estado-pendiente',
    mora:      'text-estado-mora',
    info:      'text-estado-info',
  };
  const Elemento = onClick ? 'button' : 'div';

  return (
    <Elemento
      onClick={onClick}
      className={`rounded-2xl bg-surface p-4 text-left ring-1 ring-border-token shadow-[0_1px_2px_rgb(24_28_48/0.04)]
        ${onClick ? 'w-full transition-shadow duration-rapido hover:shadow-[0_6px_18px_rgb(24_28_48/0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-content-muted">{etiqueta}</p>
        {icono && <span className="shrink-0 text-content-muted" aria-hidden>{icono}</span>}
      </div>

      <p className={`mt-1.5 font-display text-dato-lg font-bold tabular-nums ${tonos[tono]}`}>{valor}</p>

      {(detalle || tendencia) && (
        <div className="mt-1 flex items-baseline gap-2 text-xs text-content-muted">
          {tendencia && (
            <span className={`font-medium tabular-nums ${tendencia.valor >= 0 ? 'text-estado-activo' : 'text-estado-mora'}`}>
              {tendencia.valor >= 0 ? '↑' : '↓'} {Math.abs(tendencia.valor)}%
              {tendencia.etiqueta && <span className="ml-1 font-normal text-content-muted">{tendencia.etiqueta}</span>}
            </span>
          )}
          {detalle && <span>{detalle}</span>}
        </div>
      )}
    </Elemento>
  );
}

// ─────────────────────────────────────────── AppSummaryCard

/**
 * Resumen de líneas (base + entradas − salidas = total), como el arqueo de caja.
 * Marca cuáles suman al total y cuáles son solo informativas: en Caja hay líneas
 * que se muestran pero no cuentan como efectivo, y confundirlas descuadra el cierre.
 */
export function AppSummaryCard({ titulo, lineas, total, nota }: {
  titulo?: string;
  lineas: { etiqueta: string; valor: number; direccion?: 'entra' | 'sale'; informativa?: boolean }[];
  total?: { etiqueta: string; valor: number };
  nota?: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-surface ring-1 ring-border-token shadow-[0_1px_2px_rgb(24_28_48/0.04)]">
      {titulo && (
        <div className="border-b border-border-token px-4 py-3">
          <h3 className="font-display text-sm font-semibold text-content-strong">{titulo}</h3>
        </div>
      )}

      <dl className="divide-y divide-border-token px-4">
        {lineas.map((l) => (
          <div key={l.etiqueta} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <dt className="flex items-center gap-1.5 text-content">
              {l.etiqueta}
              {l.informativa && (
                <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium text-content-muted">
                  no suma
                </span>
              )}
            </dt>
            <dd className={`tabular-nums font-medium ${l.direccion === 'sale' ? 'text-estado-mora' : 'text-content-strong'}`}>
              {l.direccion === 'sale' ? '− ' : l.direccion === 'entra' ? '+ ' : ''}
              {money(Math.abs(l.valor))}
            </dd>
          </div>
        ))}
      </dl>

      {total && (
        <div className="flex items-center justify-between gap-3 border-t-2 border-border-token px-4 py-3">
          <span className="text-sm font-semibold text-content-strong">{total.etiqueta}</span>
          <AppMoney valor={total.valor} peso="destacado" />
        </div>
      )}

      {nota && <p className="px-4 pb-3 text-xs text-content-muted">{nota}</p>}
    </div>
  );
}

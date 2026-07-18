import type { ReactNode } from 'react';
import { money } from '@/lib/format';

/**
 * TARJETA KPI del Design System (dashboards por rol).
 * Muestra un indicador con icono + color de estado (nunca solo texto).
 * tono: neutro | brand | money | alerta | atencion | positivo | info
 */
const TONOS: Record<string, { card: string; icon: string; valor: string }> = {
  brand:    { card: 'bg-brand-50 ring-brand-100', icon: 'bg-brand-100 text-brand-700', valor: 'text-brand-700' },
  money:    { card: 'bg-money-50 ring-money-100', icon: 'bg-money-100 text-money-700', valor: 'text-money-700' },
  alerta:   { card: 'bg-rose-50 ring-rose-100', icon: 'bg-rose-100 text-rose-700', valor: 'text-rose-700' },
  atencion: { card: 'bg-amber-50 ring-amber-100', icon: 'bg-amber-100 text-amber-800', valor: 'text-amber-800' },
  positivo: { card: 'bg-money-50 ring-money-100', icon: 'bg-money-100 text-money-700', valor: 'text-money-700' },
  info:     { card: 'bg-sky-50 ring-sky-100', icon: 'bg-sky-100 text-sky-700', valor: 'text-sky-700' },
  neutro:   { card: 'bg-surface ring-border-token', icon: 'bg-surface-3 text-content-muted', valor: 'text-content-strong' },
};

export function KpiCard({ titulo, valor, detalle, tono = 'neutro', icon, onClick }:
  { titulo: string; valor: string; detalle?: string; tono?: string; icon?: ReactNode; onClick?: () => void }) {
  const t = TONOS[tono] ?? TONOS.neutro;
  const Wrap = onClick ? 'button' : 'div';
  return (
    <Wrap onClick={onClick}
      className={`flex items-start gap-3 rounded-2xl p-4 text-left shadow-card ring-1 transition ${t.card} ${onClick ? 'hover:shadow-soft hover:-translate-y-0.5' : ''}`}>
      {icon && <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${t.icon}`}>{icon}</span>}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium uppercase tracking-wide text-content-muted">{titulo}</div>
        <div className={`mt-0.5 font-display text-xl font-bold tabular-nums ${t.valor}`}>{valor}</div>
        {detalle && <div className="mt-0.5 text-xs text-content-muted">{detalle}</div>}
      </div>
    </Wrap>
  );
}

/** Fila de acción rápida (para el dashboard del cobrador). */
export function AccionRapida({ titulo, detalle, icon, tono = 'brand', onClick, badge }:
  { titulo: string; detalle?: string; icon: ReactNode; tono?: string; onClick: () => void; badge?: number }) {
  const t = TONOS[tono] ?? TONOS.brand;
  return (
    <button onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl bg-surface p-4 text-left shadow-card ring-1 ring-border-token transition hover:shadow-soft hover:-translate-y-0.5">
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${t.icon}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-content-strong">{titulo}</div>
        {detalle && <div className="text-xs text-content-muted">{detalle}</div>}
      </div>
      {badge !== undefined && badge > 0 && (
        <span className="grid min-w-[1.5rem] place-items-center rounded-full bg-rose-500 px-2 py-0.5 text-xs font-bold text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      <span className="text-content-muted">→</span>
    </button>
  );
}

/** Iconos livianos para KPIs (inline SVG, heredan color). */
export const KpiIcon = {
  money: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>,
  alert: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>,
  check: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>,
  trend: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>,
  wallet: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" /><path d="M4 6v12c0 1.1.9 2 2 2h14v-4" /><path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z" /></svg>,
  users: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  clock: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
  doc: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>,
  route: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="19" r="3" /><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" /><circle cx="18" cy="5" r="3" /></svg>,
};

export { money };

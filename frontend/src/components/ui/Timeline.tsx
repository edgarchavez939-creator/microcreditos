import type { ReactNode } from 'react';

/**
 * TIMELINE del Design System.
 * Línea de tiempo vertical con hitos. Cada hito lleva color + icono (nunca solo texto).
 * Reutilizable para: actividad del cliente, trazabilidad de solicitud, historial.
 */
export interface HitoTimeline {
  titulo: string;
  detalle?: string | null;
  fecha?: string;
  tono?: 'brand' | 'money' | 'alerta' | 'atencion' | 'neutro' | 'info';
  icon?: ReactNode;
}

const PUNTO: Record<string, string> = {
  brand: 'bg-brand-500', money: 'bg-money-500', alerta: 'bg-rose-500',
  atencion: 'bg-amber-500', info: 'bg-sky-500', neutro: 'bg-slate-400',
};

export function Timeline({ hitos, vacio = 'Sin actividad registrada.' }:
  { hitos: HitoTimeline[]; vacio?: string }) {
  if (!hitos.length) {
    return <p className="rounded-xl bg-surface-2 py-6 text-center text-sm text-content-muted">{vacio}</p>;
  }
  return (
    <ol className="relative ml-2 border-l-2 border-border-token">
      {hitos.map((h, i) => (
        <li key={i} className="relative mb-4 pl-5 last:mb-0">
          <span className={`absolute -left-[7px] top-1 h-3 w-3 rounded-full ring-2 ring-surface ${PUNTO[h.tono ?? 'neutro']}`} />
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-medium capitalize text-content-strong">{h.titulo}</div>
              {h.detalle && <div className="text-xs text-content-muted">{h.detalle}</div>}
            </div>
            {h.fecha && <time className="shrink-0 text-xs text-content-muted">{h.fecha}</time>}
          </div>
        </li>
      ))}
    </ol>
  );
}

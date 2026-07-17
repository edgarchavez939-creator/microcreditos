import { MONEY_ESCALA_LABEL } from '@/lib/format';

/**
 * Etiqueta estándar que advierte que los valores monetarios se muestran en miles.
 * Reutilizable en cualquier pantalla con dinero. Fuente única del texto (format.ts),
 * así que si cambia la política de escala, cambia en un solo lugar.
 */
export function EscalaMoneda({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500 ${className}`}
      title="Los valores se muestran en miles de pesos. Se capturan y almacenan en pesos completos."
    >
      <span className="text-slate-400">×1.000</span>
      {MONEY_ESCALA_LABEL}
    </span>
  );
}

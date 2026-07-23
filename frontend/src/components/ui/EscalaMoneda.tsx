import { MONEY_ESCALA_LABEL } from '@/lib/format';

/**
 * Etiqueta estándar que advierte que los valores monetarios se muestran en miles.
 * Reutilizable en cualquier pantalla con dinero. Fuente única del texto (format.ts),
 * así que si cambia la política de escala, cambia en un solo lugar.
 */
export function EscalaMoneda({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-surface-3 px-2.5 py-0.5 text-xs font-medium text-content-muted ${className}`}
      title="Los valores se muestran y se escriben en miles de pesos (350 = $350.000). El sistema guarda y calcula siempre en pesos reales."
    >
      <span className="text-content-muted">×1.000</span>
      {MONEY_ESCALA_LABEL}
    </span>
  );
}

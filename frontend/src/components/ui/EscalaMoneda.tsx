
/**
 * Etiqueta estándar que advierte que los valores monetarios se muestran en miles.
 * Reutilizable en cualquier pantalla con dinero. Fuente única del texto (format.ts),
 * así que si cambia la política de escala, cambia en un solo lugar.
 */
export function EscalaMoneda({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-estado-info-bg px-2.5 py-1 text-xs font-medium text-estado-info ${className}`}
      title="Los valores se muestran y se escriben en miles de pesos (350 = $350.000). El sistema guarda y calcula siempre en pesos reales."
    >
      <span className="font-semibold">×1.000</span>
      <span className="opacity-80">en miles</span>
    </span>
  );
}

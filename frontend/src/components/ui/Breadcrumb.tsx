/**
 * BREADCRUMB (Fase 6 UX): ubica al usuario dentro de la app.
 * "Inicio" siempre navega al dashboard; el módulo actual cierra la ruta.
 */
export function Breadcrumb({ modulo, onInicio }: { modulo: string; onInicio: () => void }) {
  return (
    <nav aria-label="Ruta de navegación" className="mb-4 flex items-center gap-1.5 text-xs text-content-muted">
      <button onClick={onInicio} className="rounded hover:text-brand-700 hover:underline focus-visible:outline-brand-500">
        Inicio
      </button>
      <span aria-hidden>›</span>
      <span className="font-medium text-content">{modulo}</span>
    </nav>
  );
}

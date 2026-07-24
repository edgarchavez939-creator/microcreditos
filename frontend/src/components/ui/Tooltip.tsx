import { ReactNode } from 'react';

/**
 * TOOLTIP (Fase 6 UX): ayuda contextual accesible, sin dependencias.
 * Aparece al pasar el mouse o al enfocar con teclado.
 */
export function Tooltip({ texto, children, lado = 'arriba' }: {
  texto: string; children: ReactNode; lado?: 'arriba' | 'abajo';
}) {
  const pos = lado === 'arriba' ? 'bottom-full mb-1.5' : 'top-full mt-1.5';
  return (
    <span className="group relative inline-flex">
      {children}
      <span role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-40 w-max max-w-[240px] -translate-x-1/2 ${pos}
          rounded-lg bg-ink px-2.5 py-1.5 text-[11px] leading-snug text-white opacity-0 shadow-lg
          transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100`}>
        {texto}
      </span>
    </span>
  );
}

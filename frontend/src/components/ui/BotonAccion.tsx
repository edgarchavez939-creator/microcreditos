import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  cargando?: boolean;
  children: ReactNode;
  variante?: 'primary' | 'money' | 'outline' | 'danger';
}

/** Botón con spinner integrado para acciones asíncronas. */
export function BotonAccion({ cargando, children, variante = 'primary', className = '', disabled, ...props }: Props) {
  const clase = {
    primary: 'btn-primary', money: 'btn-money', outline: 'btn-outline', danger: 'btn-danger',
  }[variante];
  return (
    <button {...props} disabled={disabled || cargando} className={`${clase} ${className}`}>
      {cargando && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

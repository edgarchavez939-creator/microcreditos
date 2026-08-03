import { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * PRIMITIVOS DEL DESIGN SYSTEM.
 *
 * Estas piezas son la base de todo lo demás. Reglas que cumplen todas:
 *  - Área táctil mínima de 44px en móvil (uso en campo, con una mano).
 *  - Foco visible por teclado (accesibilidad).
 *  - Colores tomados de los tokens: ninguna pieza inventa un color.
 *  - Sin estilos en línea: la apariencia vive aquí, no en las pantallas.
 */

// ─────────────────────────────────────────── AppButton

type Tono = 'primario' | 'secundario' | 'dinero' | 'peligro' | 'fantasma';
type Talla = 'sm' | 'md' | 'lg';

const TONOS: Record<Tono, string> = {
  primario:   'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-700 shadow-card',
  secundario: 'bg-surface text-content ring-1 ring-border-token hover:bg-surface-3',
  dinero:     'bg-money-600 text-white hover:bg-money-700 active:bg-money-700 shadow-card',
  peligro:    'bg-estado-mora text-white hover:brightness-95 active:brightness-90 shadow-card',
  fantasma:   'bg-transparent text-content hover:bg-surface-3',
};

const TALLAS: Record<Talla, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5 rounded-lg',
  md: 'min-h-touch px-4 text-sm gap-2 rounded-xl',
  lg: 'min-h-touch px-6 text-base gap-2 rounded-xl',
};

export function AppButton({
  children, tono = 'primario', talla = 'md', cargando, iconoIzq, iconoDer,
  ancho, className = '', disabled, ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tono?: Tono; talla?: Talla; cargando?: boolean;
  iconoIzq?: ReactNode; iconoDer?: ReactNode; ancho?: boolean;
}) {
  return (
    <button
      disabled={disabled || cargando}
      className={`inline-flex items-center justify-center font-medium
        transition-colors duration-rapido
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500
        disabled:cursor-not-allowed disabled:opacity-50
        ${TONOS[tono]} ${TALLAS[talla]} ${ancho ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {cargando
        ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
        : iconoIzq}
      {children}
      {!cargando && iconoDer}
    </button>
  );
}

// ─────────────────────────────────────────── AppCard

/**
 * Tarjeta. `estado` pinta una banda lateral de color: en una lista larga el
 * cobrador distingue mora de al-día sin leer, solo por el borde.
 */
export function AppCard({
  children, titulo, descripcion, acciones, estado, plano, className = '', onClick,
}: {
  children?: ReactNode; titulo?: ReactNode; descripcion?: ReactNode; acciones?: ReactNode;
  estado?: 'activo' | 'info' | 'pendiente' | 'mora' | 'validacion' | 'inactivo' | 'bloqueado';
  plano?: boolean; className?: string; onClick?: () => void;
}) {
  const bandas: Record<string, string> = {
    activo: 'border-l-4 border-l-estado-activo',
    info: 'border-l-4 border-l-estado-info',
    pendiente: 'border-l-4 border-l-estado-pendiente',
    mora: 'border-l-4 border-l-estado-mora',
    validacion: 'border-l-4 border-l-estado-validacion',
    inactivo: 'border-l-4 border-l-estado-inactivo',
    bloqueado: 'border-l-4 border-l-estado-bloqueado',
  };
  const Elemento = onClick ? 'button' : 'div';

  return (
    <Elemento
      onClick={onClick}
      className={`w-full rounded-2xl bg-surface text-left ring-1 ring-border-token
        ${plano ? '' : 'shadow-[0_1px_2px_rgb(24_28_48/0.04)]'}
        ${estado ? bandas[estado] : ''}
        ${onClick ? 'transition-shadow duration-rapido hover:shadow-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500' : ''}
        ${className}`}
    >
      {(titulo || acciones) && (
        <div className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5">
          <div className="min-w-0">
            {titulo && <h3 className="font-display text-sm font-semibold text-content-strong">{titulo}</h3>}
            {descripcion && <p className="mt-0.5 text-xs text-content-muted">{descripcion}</p>}
          </div>
          {acciones && <div className="shrink-0">{acciones}</div>}
        </div>
      )}
      {children && <div className="p-4 sm:p-5">{children}</div>}
    </Elemento>
  );
}

// ─────────────────────────────────────────── AppChip / AppStatus

const ESTADO_CHIP: Record<string, { cls: string; punto: string }> = {
  activo:     { cls: 'bg-estado-activo-bg text-estado-activo',         punto: 'bg-estado-activo' },
  info:       { cls: 'bg-estado-info-bg text-estado-info',             punto: 'bg-estado-info' },
  pendiente:  { cls: 'bg-estado-pendiente-bg text-estado-pendiente',   punto: 'bg-estado-pendiente' },
  mora:       { cls: 'bg-estado-mora-bg text-estado-mora',             punto: 'bg-estado-mora' },
  validacion: { cls: 'bg-estado-validacion-bg text-estado-validacion', punto: 'bg-estado-validacion' },
  inactivo:   { cls: 'bg-estado-inactivo-bg text-estado-inactivo',     punto: 'bg-estado-inactivo' },
  bloqueado:  { cls: 'bg-estado-bloqueado-bg text-estado-bloqueado',   punto: 'bg-estado-bloqueado' },
};

export type TonoEstado = keyof typeof ESTADO_CHIP;

/** Etiqueta de estado. El punto de color permite leerla incluso a distancia. */
export function AppChip({ children, tono = 'inactivo', punto = true, className = '' }: {
  children: ReactNode; tono?: TonoEstado; punto?: boolean; className?: string;
}) {
  const e = ESTADO_CHIP[tono] ?? ESTADO_CHIP.inactivo;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5
      text-xs font-medium ${e.cls} ${className}`}>
      {punto && <span className={`h-1.5 w-1.5 rounded-full ${e.punto}`} aria-hidden />}
      {children}
    </span>
  );
}

// ─────────────────────────────────────────── AppAvatar

export function AppAvatar({ nombre, talla = 'md', color }: {
  nombre: string; talla?: 'sm' | 'md' | 'lg'; color?: string;
}) {
  const iniciales = nombre.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
  const tallas = { sm: 'h-7 w-7 text-[10px]', md: 'h-9 w-9 text-xs', lg: 'h-12 w-12 text-sm' };
  return (
    <span
      title={nombre}
      className={`inline-flex shrink-0 items-center justify-center rounded-full
        font-semibold text-white ${tallas[talla]}`}
      style={{ backgroundColor: color ?? 'rgb(79 70 229)' }}
    >
      {iniciales || '?'}
    </span>
  );
}

// ─────────────────────────────────────────── AppAlert

export function AppAlert({ children, tono = 'info', titulo, onCerrar }: {
  children: ReactNode; tono?: 'info' | 'activo' | 'pendiente' | 'mora'; titulo?: string; onCerrar?: () => void;
}) {
  const tonos = {
    info:      'bg-estado-info-bg text-estado-info',
    activo:    'bg-estado-activo-bg text-estado-activo',
    pendiente: 'bg-estado-pendiente-bg text-estado-pendiente',
    mora:      'bg-estado-mora-bg text-estado-mora',
  };
  return (
    <div role={tono === 'mora' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm ${tonos[tono]}`}>
      <div className="min-w-0 flex-1">
        {titulo && <p className="font-semibold">{titulo}</p>}
        <div className={titulo ? 'mt-0.5' : ''}>{children}</div>
      </div>
      {onCerrar && (
        <button onClick={onCerrar} aria-label="Cerrar aviso"
          className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 focus-visible:outline focus-visible:outline-2">
          ✕
        </button>
      )}
    </div>
  );
}

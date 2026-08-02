import { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes, useId } from 'react';

/**
 * FORMULARIOS.
 *
 * Un campo tiene siempre tres capas: qué es (etiqueta), cómo llenarlo (ayuda)
 * y qué salió mal (error). El error sustituye a la ayuda para no apilar texto,
 * y va asociado por aria para que un lector de pantalla lo anuncie.
 *
 * Los campos obligatorios se marcan con un punto, no con asterisco: el asterisco
 * suele confundirse con una nota al pie.
 */

function Envoltura({ id, etiqueta, ayuda, error, requerido, children }: {
  id: string; etiqueta?: string; ayuda?: ReactNode; error?: string; requerido?: boolean; children: ReactNode;
}) {
  return (
    <div>
      {etiqueta && (
        <label htmlFor={id} className="mb-1 flex items-center gap-1.5 text-sm font-medium text-content">
          {etiqueta}
          {requerido && <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-label="obligatorio" />}
        </label>
      )}
      {children}
      {error
        ? <p id={`${id}-msg`} role="alert" className="mt-1 text-xs text-estado-mora">{error}</p>
        : ayuda ? <p id={`${id}-msg`} className="mt-1 text-xs text-content-muted">{ayuda}</p> : null}
    </div>
  );
}

const BASE = `w-full rounded-xl bg-surface px-3 text-sm text-content
  ring-1 ring-border-token transition-shadow duration-rapido
  placeholder:text-content-muted/70
  focus:outline-none focus:ring-2 focus:ring-brand-500
  disabled:cursor-not-allowed disabled:bg-surface-3 disabled:opacity-70`;

// ─────────────────────────────────────────── AppInput

export function AppInput({
  etiqueta, ayuda, error, requerido, prefijo, sufijo, className = '', id, ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  etiqueta?: string; ayuda?: ReactNode; error?: string; requerido?: boolean;
  prefijo?: ReactNode; sufijo?: ReactNode;
}) {
  const auto = useId();
  const idCampo = id ?? auto;

  return (
    <Envoltura id={idCampo} etiqueta={etiqueta} ayuda={ayuda} error={error} requerido={requerido}>
      <div className="relative">
        {prefijo && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-content-muted">
            {prefijo}
          </span>
        )}
        <input
          id={idCampo}
          aria-invalid={!!error}
          aria-describedby={`${idCampo}-msg`}
          className={`${BASE} min-h-touch ${prefijo ? 'pl-8' : ''} ${sufijo ? 'pr-14' : ''}
            ${error ? 'ring-estado-mora focus:ring-estado-mora' : ''} ${className}`}
          {...props}
        />
        {sufijo && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-content-muted">
            {sufijo}
          </span>
        )}
      </div>
    </Envoltura>
  );
}

// ─────────────────────────────────────────── AppSelect

export function AppSelect({
  etiqueta, ayuda, error, requerido, opciones, placeholder, className = '', id, ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  etiqueta?: string; ayuda?: ReactNode; error?: string; requerido?: boolean;
  opciones: { valor: string | number; texto: string; deshabilitada?: boolean }[];
  placeholder?: string;
}) {
  const auto = useId();
  const idCampo = id ?? auto;

  return (
    <Envoltura id={idCampo} etiqueta={etiqueta} ayuda={ayuda} error={error} requerido={requerido}>
      <select
        id={idCampo}
        aria-invalid={!!error}
        aria-describedby={`${idCampo}-msg`}
        className={`${BASE} min-h-touch pr-8 ${error ? 'ring-estado-mora focus:ring-estado-mora' : ''} ${className}`}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor} disabled={o.deshabilitada}>{o.texto}</option>
        ))}
      </select>
    </Envoltura>
  );
}

// ─────────────────────────────────────────── AppTextarea

export function AppTextarea({
  etiqueta, ayuda, error, requerido, className = '', id, ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  etiqueta?: string; ayuda?: ReactNode; error?: string; requerido?: boolean;
}) {
  const auto = useId();
  const idCampo = id ?? auto;

  return (
    <Envoltura id={idCampo} etiqueta={etiqueta} ayuda={ayuda} error={error} requerido={requerido}>
      <textarea
        id={idCampo}
        rows={props.rows ?? 3}
        aria-invalid={!!error}
        aria-describedby={`${idCampo}-msg`}
        className={`${BASE} py-2.5 ${error ? 'ring-estado-mora focus:ring-estado-mora' : ''} ${className}`}
        {...props}
      />
    </Envoltura>
  );
}

// ─────────────────────────────────────────── AppFilter

/** Barra de filtros. En móvil se desplaza horizontalmente en vez de apilarse. */
export function AppFilter({ children, onLimpiar, activos }: {
  children: ReactNode; onLimpiar?: () => void; activos?: number;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-2">
      {children}
      {onLimpiar && !!activos && (
        <button onClick={onLimpiar}
          className="min-h-touch text-xs font-medium text-brand-700 hover:underline
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500">
          Quitar filtros ({activos})
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────── AppPermissionGuard

/**
 * Oculta o explica según los permisos. Es solo una ayuda visual: la autorización
 * real la impone el servidor en cada petición, nunca el navegador.
 */
export function AppPermissionGuard({ permitido, children, mensaje, modo = 'ocultar' }: {
  permitido: boolean; children: ReactNode; mensaje?: string; modo?: 'ocultar' | 'explicar';
}) {
  if (permitido) return <>{children}</>;
  if (modo === 'ocultar') return null;

  return (
    <div className="rounded-xl bg-surface-3 px-4 py-6 text-center">
      <p className="text-sm text-content-muted">
        {mensaje ?? 'No tienes permiso para ver esta sección. Solicítalo al administrador.'}
      </p>
    </div>
  );
}

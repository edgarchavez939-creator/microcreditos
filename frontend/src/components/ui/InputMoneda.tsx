import { useEffect, useState } from 'react';
import { MONEY_DIVISOR } from '@/lib/format';

/**
 * INPUT MONETARIO EN MILES (Design System · fuente única de captura de dinero).
 *
 * El usuario ESCRIBE en miles (350 = $350.000), igual que ve los valores en toda la
 * app. El componente entrega SIEMPRE pesos reales al formulario y al backend, así que
 * la lógica financiera no cambia en ningún punto.
 *
 * Seguridad: bajo el campo se muestra el valor real en pesos que se guardará, para
 * que el usuario confirme visualmente y no haya errores de escala (×1000).
 *
 * Ningún formulario debe volver a implementar esta conversión: usar este componente.
 */
export function InputMoneda({
  valorPesos, onChangePesos, placeholder = '0', disabled, id, autoFocus,
  className = '', maxPesos, mostrarEquivalencia = true,
}: {
  valorPesos: number | string | null | undefined;
  onChangePesos: (pesos: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  autoFocus?: boolean;
  className?: string;
  maxPesos?: number;
  mostrarEquivalencia?: boolean;
}) {
  // Texto que ve el usuario (en miles). Se mantiene como string para permitir
  // estados intermedios de escritura ("", "1.", "0,5") sin pelear con el cursor.
  const [texto, setTexto] = useState('');

  // Sincronizar desde fuera (edición de un registro existente, reset del formulario)
  useEffect(() => {
    const pesos = typeof valorPesos === 'string' ? parseFloat(valorPesos) : valorPesos;
    if (pesos === null || pesos === undefined || Number.isNaN(pesos)) {
      setTexto((t) => (t === '' ? t : ''));
      return;
    }
    const enMiles = (pesos as number) / MONEY_DIVISOR;
    // No pisar lo que el usuario está escribiendo si ya representa el mismo valor
    const actual = parseFloat(texto.replace(',', '.'));
    if (Number.isNaN(actual) || Math.abs(actual - enMiles) > 0.0000001) {
      setTexto(enMiles === 0 ? '' : String(enMiles));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valorPesos]);

  const onChange = (raw: string) => {
    // Permitir dígitos, coma y punto decimal; nada más.
    const limpio = raw.replace(/[^\d.,-]/g, '');
    setTexto(limpio);

    if (limpio.trim() === '' || limpio === '-') {
      onChangePesos(null);
      return;
    }
    const miles = parseFloat(limpio.replace(',', '.'));
    if (Number.isNaN(miles)) {
      onChangePesos(null);
      return;
    }
    // Miles -> pesos. Se redondea para evitar arrastres de coma flotante.
    onChangePesos(Math.round(miles * MONEY_DIVISOR));
  };

  const pesosActuales = (() => {
    const miles = parseFloat(texto.replace(',', '.'));
    return Number.isNaN(miles) ? null : Math.round(miles * MONEY_DIVISOR);
  })();

  const excede = maxPesos !== undefined && pesosActuales !== null && pesosActuales > maxPesos;

  return (
    <div>
      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={texto}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          className={`input pr-16 ${className}`}
          aria-describedby={id ? `${id}-equiv` : undefined}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-content-muted">
          miles
        </span>
      </div>
      {mostrarEquivalencia && (
        <p id={id ? `${id}-equiv` : undefined}
          className={`mt-1 text-xs ${excede ? 'text-rose-600' : 'text-content-muted'}`}>
          {pesosActuales === null
            ? 'Escribe el valor en miles (ej: 350 = $350.000)'
            : <>Se guardará: <b className="tabular-nums">${pesosActuales.toLocaleString('es-CO')}</b>
                {excede && ' · supera el máximo permitido'}</>}
        </p>
      )}
    </div>
  );
}

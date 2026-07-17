/**
 * REPRESENTACIÓN MONETARIA EN MILES (Single Source of Truth).
 *
 * Toda la aplicación MUESTRA los valores en miles, pero SIEMPRE almacena, envía y
 * calcula en pesos reales. La conversión es exclusivamente de presentación: se hace
 * aquí, en un único lugar, y todos los componentes que usan money() la heredan.
 *
 * Los formularios NO usan esta división: siguen capturando pesos completos, que es
 * lo más seguro para dinero real (evita errores ×1000 y ambigüedad con centavos).
 *
 * MONEY_DIVISOR es el factor de presentación. Para volver a pesos completos en toda
 * la app, basta con ponerlo en 1.
 */
export const MONEY_DIVISOR = 1000;

/** Etiqueta estándar para rotular las pantallas ("valores en miles"). */
export const MONEY_ESCALA_LABEL = 'Valores en miles de pesos';

/** Convierte un valor en pesos a número (tolera strings de PostgreSQL). */
const aNumero = (n: number | string | null | undefined): number => {
  const v = typeof n === 'string' ? parseFloat(n) : n ?? 0;
  return Number.isFinite(v) ? (v as number) : 0;
};

/**
 * Formatea dinero para VISUALIZACIÓN, en miles.
 * El valor de entrada está SIEMPRE en pesos reales; aquí se escala solo para mostrar.
 * Conserva precisión: si el valor no es múltiplo exacto de mil, muestra los decimales
 * necesarios (hasta 2) para no perder información; si es exacto, no muestra decimales.
 */
export const money = (n: number | string | null | undefined) => {
  const pesos = aNumero(n);
  const enMiles = pesos / MONEY_DIVISOR;
  // Decimales: solo los necesarios (0 si es múltiplo de mil, hasta 2 si no)
  const tieneFraccion = Math.round(enMiles * 100) % 100 !== 0;
  const s = enMiles.toLocaleString('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: tieneFraccion ? 2 : 0,
  });
  return `$ ${s}`;
};

/**
 * Formatea dinero en pesos completos (sin escalar a miles). Para los pocos casos
 * donde se necesite el valor real explícito (p. ej. un comprobante legal).
 */
export const moneyPesos = (n: number | string | null | undefined) => {
  return aNumero(n).toLocaleString('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0,
  });
};

/** Convierte un valor en pesos a su representación numérica en miles (para inputs que lo requieran). */
export const aMiles = (pesos: number | string | null | undefined): number => aNumero(pesos) / MONEY_DIVISOR;

/** Convierte un valor escrito en miles a pesos reales (para guardar). */
export const aPesos = (miles: number | string | null | undefined): number => Math.round(aNumero(miles) * MONEY_DIVISOR);

export const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

/**
 * Formatea una fecha como dd/MM/yyyy (estándar visual de toda la app).
 * Tolera: 'YYYY-MM-DD', ISO con hora, Date, epoch. Devuelve '' si no es válida.
 * Para fechas 'YYYY-MM-DD' (sin hora) se interpretan como locales, evitando
 * el corrimiento de un día por zona horaria.
 */
export const fecha = (v: string | number | Date | null | undefined): string => {
  if (v === null || v === undefined || v === '') return '';
  let d: Date;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, day] = v.split('-').map(Number);
    d = new Date(y, m - 1, day);
  } else {
    d = new Date(v);
  }
  if (Number.isNaN(d.getTime())) return typeof v === 'string' ? v : '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

/** Formatea fecha y hora como dd/MM/yyyy HH:mm. Devuelve '' si no es válida. */
export const fechaHora = (v: string | number | Date | null | undefined): string => {
  if (v === null || v === undefined || v === '') return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return typeof v === 'string' ? v : '';
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${fecha(d)} ${hh}:${min}`;
};

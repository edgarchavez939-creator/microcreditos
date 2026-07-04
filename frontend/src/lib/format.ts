/** Formatea dinero. Tolera strings numéricos (PostgreSQL envía decimales como texto). */
export const money = (n: number | string | null | undefined) => {
  const v = typeof n === 'string' ? parseFloat(n) : n ?? 0;
  return (Number.isFinite(v) ? (v as number) : 0).toLocaleString('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0,
  });
};

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

/** Formatea dinero. Tolera strings numéricos (PostgreSQL envía decimales como texto). */
export const money = (n: number | string | null | undefined) => {
  const v = typeof n === 'string' ? parseFloat(n) : n ?? 0;
  return (Number.isFinite(v) ? (v as number) : 0).toLocaleString('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0,
  });
};

export const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

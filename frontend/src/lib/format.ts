export const money = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0,
  });

export const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

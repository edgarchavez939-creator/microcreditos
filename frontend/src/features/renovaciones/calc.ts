// Espejo en cliente de ReamortizacionService::previsualizar (preview en vivo).
export interface PreviewReamortizacion {
  saldoPendiente: number;
  nuevoCapital: number;
  valorSeguro: number;
  valorDesembolsado: number;   // bruto del préstamo
  saldoRefinanciado: number;
  dineroAdicional: number;     // capital nuevo − saldo
  recibidoCliente: number;     // efectivo neto entregado
  interesGenerado: number;     // capital × tasa mensual × meses
  totalDeudaNueva: number;     // capital + interés (sin seguro)
  valorCuota: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function calcularReamortizacion(
  saldoPendiente: number,
  nuevoCapital: number,
  pctSeguro: number,
  tasaMensual: number,
  meses: number,
  exonerado = false,
): PreviewReamortizacion {
  const pct = exonerado ? 0 : pctSeguro;
  const valorSeguro = r2(nuevoCapital * pct);
  const valorDesembolsado = r2(nuevoCapital - valorSeguro);
  const interesGenerado = r2(nuevoCapital * tasaMensual * meses); // SIEMPRE sobre capital aprobado
  const totalDeudaNueva = r2(nuevoCapital + interesGenerado);     // sin seguro
  const dineroAdicional = r2(nuevoCapital - saldoPendiente);
  const recibidoCliente = r2(Math.max(valorDesembolsado - saldoPendiente, 0));
  const valorCuota = r2(totalDeudaNueva / Math.max(meses, 1));
  return {
    saldoPendiente: r2(saldoPendiente), nuevoCapital: r2(nuevoCapital),
    valorSeguro, valorDesembolsado, saldoRefinanciado: r2(saldoPendiente),
    dineroAdicional, recibidoCliente, interesGenerado, totalDeudaNueva, valorCuota,
  };
}

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
  numeroCuotas: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export const PERIODOS_POR_MES: Record<string, number> = {
  MENSUAL: 1, QUINCENAL: 2, SEMANAL: 4, DIARIO: 30,
};

export function calcularReamortizacion(
  saldoPendiente: number,
  nuevoCapital: number,
  pctSeguro: number,
  tasaMensual: number,
  meses: number,
  exonerado = false,
  modalidad = 'MENSUAL',
): PreviewReamortizacion {
  const pct = exonerado ? 0 : pctSeguro;
  const valorSeguro = r2(nuevoCapital * pct);
  const valorDesembolsado = r2(nuevoCapital - valorSeguro);
  const interesGenerado = r2(nuevoCapital * tasaMensual * meses); // SIEMPRE sobre capital aprobado
  const totalDeudaNueva = r2(nuevoCapital + interesGenerado);     // sin seguro
  const dineroAdicional = r2(nuevoCapital - saldoPendiente);
  const recibidoCliente = r2(Math.max(valorDesembolsado - saldoPendiente, 0));
  const numeroCuotas = Math.max(meses, 1) * (PERIODOS_POR_MES[modalidad] ?? 1);
  const valorCuota = r2(totalDeudaNueva / numeroCuotas);
  return {
    saldoPendiente: r2(saldoPendiente), nuevoCapital: r2(nuevoCapital),
    valorSeguro, valorDesembolsado, saldoRefinanciado: r2(saldoPendiente),
    dineroAdicional, recibidoCliente, interesGenerado, totalDeudaNueva, valorCuota, numeroCuotas,
  };
}

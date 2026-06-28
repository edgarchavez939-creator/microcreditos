import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Resolver } from 'react-hook-form';
import { money } from '@/lib/format';
import { calcularReamortizacion } from './calc';
import { makeReamortizacionSchema, type ReamortizacionFormValues } from './schema';
import { useCupoCliente, useReamortizar, useSaldoPendiente } from './hooks';

interface Props {
  solicitudId: number;
  clienteId: number;
  onHecho?: () => void;
}

export function ReamortizacionForm({ solicitudId, clienteId, onHecho }: Props) {
  const saldoQ = useSaldoPendiente(solicitudId);
  const cupoQ = useCupoCliente(clienteId);
  const reamortizar = useReamortizar(solicitudId);

  const saldo = saldoQ.data?.saldo_pendiente ?? 0;
  const cupo = cupoQ.data?.cupo_disponible ?? 0;

  const resolver = useMemo(
    () => zodResolver(makeReamortizacionSchema(saldo, cupo)) as Resolver<ReamortizacionFormValues>,
    [saldo, cupo],
  );

  const { register, handleSubmit, watch, formState: { errors } } =
    useForm<ReamortizacionFormValues>({
      resolver,
      defaultValues: {
        nuevo_capital: saldo || 0,
        tasa_mensual: 0.1,
        plazo_meses: 3,
        modalidad: 'MENSUAL',
        seguro_exonerado: false,
        porcentaje_seguro: 0.08,
      },
    });

  const v = watch();
  const exonerado = watch('seguro_exonerado');
  const preview = calcularReamortizacion(
    saldo, v.nuevo_capital || 0, v.porcentaje_seguro || 0,
    v.tasa_mensual || 0, v.plazo_meses || 0, exonerado,
  );

  const onSubmit = (data: ReamortizacionFormValues) =>
    reamortizar.mutate(data, { onSuccess: () => onHecho?.() });

  if (saldoQ.isLoading || cupoQ.isLoading) {
    return <p className="text-sm text-slate-500">Cargando saldo y cupo…</p>;
  }

  // Éxito: resumen de la renovación devuelta por el backend
  if (reamortizar.isSuccess) {
    const r = reamortizar.data?.renovacion;
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-2">
        <p className="font-semibold text-green-800">Reamortización registrada ✓</p>
        <Row label="Saldo refinanciado" value={money(r.saldo_refinanciado)} />
        <Row label="Nuevo capital aprobado" value={money(r.capital_aprobado)} />
        <Row label="Seguro descontado" value={money(r.valor_seguro)} />
        <Row label="Valor desembolsado" value={money(r.valor_desembolsado)} />
        <Row label="Efectivo entregado al cliente" value={money(r.recibido_cliente)} bold />
        <Row label="Nueva deuda total" value={money(r.total_deuda_nueva)} bold />
        <Row label="Cupo disponible restante" value={money(r.cupo_disponible_despues)} />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded bg-slate-50 p-3">
          <p className="text-slate-500">Saldo pendiente</p>
          <p className="font-semibold">{money(saldo)}</p>
        </div>
        <div className="rounded bg-slate-50 p-3">
          <p className="text-slate-500">Cupo disponible</p>
          <p className="font-semibold">{money(cupo)}</p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium">Nuevo capital aprobado</label>
        <input type="number" step="any" {...register('nuevo_capital', { valueAsNumber: true })}
          className="mt-1 w-full rounded border px-3 py-2" />
        {errors.nuevo_capital && <p className="text-red-600 text-xs">{errors.nuevo_capital.message}</p>}
        <p className="text-xs text-slate-400 mt-0.5">
          Mínimo: {money(saldo)} (saldo) · Máximo: {money(cupo)} (cupo)
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium">Tasa mensual</label>
          <input type="number" step="0.01" {...register('tasa_mensual', { valueAsNumber: true })}
            className="mt-1 w-full rounded border px-3 py-2" />
          {errors.tasa_mensual && <p className="text-red-600 text-xs">{errors.tasa_mensual.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium">Plazo (meses)</label>
          <input type="number" {...register('plazo_meses', { valueAsNumber: true })}
            className="mt-1 w-full rounded border px-3 py-2" />
          {errors.plazo_meses && <p className="text-red-600 text-xs">{errors.plazo_meses.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium">Modalidad</label>
          <select {...register('modalidad')} className="mt-1 w-full rounded border px-3 py-2 bg-white">
            <option value="MENSUAL">Mensual</option>
            <option value="QUINCENAL">Quincenal</option>
            <option value="SEMANAL">Semanal</option>
            <option value="DIARIO">Diario</option>
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2">
        <input type="checkbox" {...register('seguro_exonerado')} />
        <span className="text-sm">Exonerar seguro (requiere autorización administrativa)</span>
      </label>

      {!exonerado ? (
        <div>
          <label className="block text-sm font-medium">% Seguro (0.05–0.10)</label>
          <input type="number" step="0.01" {...register('porcentaje_seguro', { valueAsNumber: true })}
            className="mt-1 w-full rounded border px-3 py-2" />
          {errors.porcentaje_seguro && <p className="text-red-600 text-xs">{errors.porcentaje_seguro.message}</p>}
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium">Motivo de exoneración</label>
          <textarea {...register('motivo_exoneracion')} className="mt-1 w-full rounded border px-3 py-2" />
          {errors.motivo_exoneracion && <p className="text-red-600 text-xs">{errors.motivo_exoneracion.message}</p>}
        </div>
      )}

      {/* Preview en vivo (espejo del backend) */}
      <div className="rounded-lg bg-slate-50 p-4 text-sm space-y-1">
        <Row label="Saldo refinanciado (cancela el anterior)" value={money(preview.saldoRefinanciado)} />
        <Row label="Valor seguro" value={money(preview.valorSeguro)} />
        <Row label="Valor desembolsado (bruto)" value={money(preview.valorDesembolsado)} />
        <Row label="Dinero adicional" value={money(preview.dineroAdicional)} />
        <Row label="Efectivo neto al cliente" value={money(preview.recibidoCliente)} bold />
        <Row label="Interés generado" value={money(preview.interesGenerado)} />
        <Row label="Nueva deuda total" value={money(preview.totalDeudaNueva)} bold />
        <Row label="Valor cuota" value={money(preview.valorCuota)} />
      </div>

      {reamortizar.isError && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {extraerError(reamortizar.error)}
        </p>
      )}

      <button type="submit" disabled={reamortizar.isPending}
        className="rounded bg-brand px-4 py-2 text-white disabled:opacity-50">
        {reamortizar.isPending ? 'Procesando…' : 'Reamortizar crédito'}
      </button>
    </form>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className={bold ? 'font-semibold' : ''}>{value}</span>
    </div>
  );
}

function extraerError(error: unknown): string {
  const e = error as { response?: { data?: { message?: string } } };
  return e?.response?.data?.message ?? 'No se pudo completar la reamortización.';
}

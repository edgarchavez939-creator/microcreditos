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
        tasa_mensual: 10,
        plazo_meses: 3,
        modalidad: 'MENSUAL',
        seguro_exonerado: false,
        porcentaje_seguro: 8,
      },
    });

  const v = watch();
  const exonerado = watch('seguro_exonerado');
  const preview = calcularReamortizacion(
    saldo, v.nuevo_capital || 0, (v.porcentaje_seguro || 0) / 100,
    (v.tasa_mensual || 0) / 100, v.plazo_meses || 0, exonerado, v.modalidad,
  );
  const MODAL_LABEL: Record<string, string> = { MENSUAL: 'mensuales', QUINCENAL: 'quincenales', SEMANAL: 'semanales', DIARIO: 'diarias' };

  const onSubmit = (data: ReamortizacionFormValues) =>
    reamortizar.mutate(
      { ...data, tasa_mensual: data.tasa_mensual / 100, porcentaje_seguro: data.porcentaje_seguro / 100 },
      { onSuccess: () => onHecho?.() },
    );

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
          className="input" />
        {errors.nuevo_capital && <p className="field-error">{errors.nuevo_capital.message}</p>}
        <p className="text-xs text-slate-400 mt-0.5">
          Mínimo: {money(saldo)} (saldo) · Máximo: {money(cupo)} (cupo)
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium">Tasa mensual (%)</label>
          <input type="number" step="0.1" {...register('tasa_mensual', { valueAsNumber: true })}
            className="input" />
          {errors.tasa_mensual && <p className="field-error">{errors.tasa_mensual.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium">Plazo (meses)</label>
          <input type="number" {...register('plazo_meses', { valueAsNumber: true })}
            className="input" />
          {errors.plazo_meses && <p className="field-error">{errors.plazo_meses.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium">Modalidad</label>
          <select {...register('modalidad')} className="input">
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
          <label className="block text-sm font-medium">% Seguro (5–10)</label>
          <input type="number" step="0.1" {...register('porcentaje_seguro', { valueAsNumber: true })}
            className="input" />
          {errors.porcentaje_seguro && <p className="field-error">{errors.porcentaje_seguro.message}</p>}
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium">Motivo de exoneración</label>
          <textarea {...register('motivo_exoneracion')} className="input" />
          {errors.motivo_exoneracion && <p className="field-error">{errors.motivo_exoneracion.message}</p>}
        </div>
      )}

      {/* Plan simulado según modalidad */}
      <div className="rounded-xl bg-brand-50 p-4 text-sm ring-1 ring-brand-100">
        <div className="font-semibold text-brand-700">Plan simulado</div>
        <div className="mt-1 text-slate-700">
          {preview.numeroCuotas > 0
            ? <>{preview.numeroCuotas} cuotas {MODAL_LABEL[v.modalidad] ?? ''} de <b>{money(preview.valorCuota)}</b></>
            : 'Completa capital y plazo para ver el plan.'}
        </div>
      </div>

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
        <p className="alert-error">
          {extraerError(reamortizar.error)}
        </p>
      )}

      <button type="submit" disabled={reamortizar.isPending}
        className="btn-primary">
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

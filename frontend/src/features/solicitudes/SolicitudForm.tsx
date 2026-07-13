import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { solicitudSchema, aPayloadSolicitud, type SolicitudForm as TForm, calcularPreview } from './schema';
import { useCrearSolicitud } from './hooks';
import { money } from '@/lib/format';

const MODALIDADES = [
  { v: 'MENSUAL', t: 'Mensual' },
  { v: 'QUINCENAL', t: 'Quincenal' },
  { v: 'SEMANAL', t: 'Semanal' },
  { v: 'DIARIO', t: 'Diario' },
];
const MODAL_LABEL: Record<string, string> = { MENSUAL: 'mensuales', QUINCENAL: 'quincenales', SEMANAL: 'semanales', DIARIO: 'diarias' };

export function SolicitudForm({ clienteId, areaId, creditoOrigenId, onCreada }:
  { clienteId: number; areaId: number; creditoOrigenId?: number; onCreada?: () => void }) {
  const crear = useCrearSolicitud();
  const [exito, setExito] = useState(false);
  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<TForm>({
    resolver: zodResolver(solicitudSchema),
    defaultValues: {
      cliente_id: clienteId, area_id: areaId, seguro_exonerado: false,
      porcentaje_seguro: 10, tasa_interes: 10, plazo_meses: 2, modalidad: 'MENSUAL',
    },
  });

  const valores = watch();
  const preview = calcularPreview(valores);
  const exonerado = watch('seguro_exonerado');
  const modalidad = watch('modalidad');

  const onSubmit = (data: TForm) => {
    setExito(false);
    // La marca de renovación viaja con la solicitud (el backend valida el origen)
    const payload = { ...aPayloadSolicitud(data), credito_origen_id: creditoOrigenId };
    crear.mutate(payload, {
      onSuccess: () => {
        setExito(true);
        reset({
          cliente_id: clienteId, area_id: areaId, seguro_exonerado: false,
          porcentaje_seguro: 10, tasa_interes: 10, plazo_meses: 2, modalidad: 'MENSUAL',
        });
        // #6: limpiar por completo el flujo (incluido el cliente seleccionado)
        onCreada?.();
      },
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card card-pad space-y-4 max-w-lg">
      {exito && (
        <div className="rounded-xl bg-money-50 px-4 py-3 text-sm text-money-700 ring-1 ring-money-100">
          Solicitud creada con éxito. Quedó pendiente de aprobación.
        </div>
      )}
      <div>
        <label className="label">Capital solicitado</label>
        <input type="number" step="any" {...register('capital_solicitado', { valueAsNumber: true })} className="input" />
        <p className="mt-1 text-xs text-slate-400">El capital aprobado lo definirá quien apruebe la solicitud.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Tasa interés mensual (%)</label>
          <input type="number" step="0.1" {...register('tasa_interes', { valueAsNumber: true })} className="input" />
          <p className="mt-1 text-xs text-slate-400">Ej: 10 = 10%</p>
        </div>
        <div>
          <label className="label">Plazo (meses)</label>
          <input type="number" min="1" {...register('plazo_meses', { valueAsNumber: true })} className="input" />
        </div>
      </div>

      <div>
        <label className="label">Modalidad de pago</label>
        <select {...register('modalidad')} className="input">
          {MODALIDADES.map((m) => <option key={m.v} value={m.v}>{m.t}</option>)}
        </select>
      </div>

      {/* Simulación estimada del plan según modalidad (el monto real lo fija el aprobador) */}
      <div className="rounded-xl bg-brand-50 p-4 text-sm ring-1 ring-brand-100">
        <div className="font-semibold text-brand-700">Plan estimado (sobre el capital solicitado)</div>
        <div className="mt-1 text-slate-700">
          {preview.numeroCuotas > 0
            ? <>{preview.numeroCuotas} cuotas {MODAL_LABEL[modalidad]} de <b>{money(preview.cuota)}</b></>
            : 'Completa capital y plazo para ver el plan estimado.'}
        </div>
      </div>

      <label className="flex items-center gap-2">
        <input type="checkbox" {...register('seguro_exonerado')} />
        <span className="text-sm">Exonerar seguro (requiere aprobación de Administrador)</span>
      </label>

      {!exonerado ? (
        <div>
          <label className="label">% Seguro (5–10)</label>
          <input type="number" step="0.1" {...register('porcentaje_seguro', { valueAsNumber: true })} className="input" />
          <p className="mt-1 text-xs text-slate-400">Ej: 8 = 8%</p>
          {errors.porcentaje_seguro && <p className="field-error">{errors.porcentaje_seguro.message}</p>}
        </div>
      ) : (
        <div>
          <label className="label">Motivo de exoneración</label>
          <textarea {...register('motivo_exoneracion')} className="input" />
          {errors.motivo_exoneracion && <p className="field-error">{errors.motivo_exoneracion.message}</p>}
        </div>
      )}

      <div className="rounded-xl bg-slate-50 p-4 text-sm space-y-1.5 ring-1 ring-slate-100">
        <div className="flex justify-between"><span>Valor seguro</span><b>{money(preview.valorSeguro)}</b></div>
        <div className="flex justify-between"><span>Monto desembolsado (neto)</span><b>{money(preview.desembolsado)}</b></div>
        <div className="flex justify-between"><span>Intereses (sobre aprobado)</span><b>{money(preview.interes)}</b></div>
        <div className="flex justify-between"><span className="font-medium text-slate-700">Total a recaudar</span><b>{money(preview.totalRecaudar)}</b></div>
        <div className="flex justify-between"><span>Valor cuota</span><b>{money(preview.cuota)}</b></div>
      </div>

      <button type="submit" disabled={crear.isPending} className="btn-primary">
        {crear.isPending ? 'Guardando…' : 'Crear solicitud'}
      </button>
    </form>
  );
}

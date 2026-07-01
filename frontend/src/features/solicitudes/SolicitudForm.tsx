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

export function SolicitudForm({ clienteId, areaId }: { clienteId: number; areaId: number }) {
  const crear = useCrearSolicitud();
  const { register, handleSubmit, watch, formState: { errors } } = useForm<TForm>({
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

  const onSubmit = (data: TForm) => crear.mutate(aPayloadSolicitud(data));

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card card-pad space-y-4 max-w-lg">
      <div>
        <label className="label">Capital solicitado</label>
        <input type="number" step="any" {...register('capital_solicitado', { valueAsNumber: true })} className="input" />
      </div>
      <div>
        <label className="label">Monto aprobado</label>
        <input type="number" step="any" {...register('monto_aprobado', { valueAsNumber: true })} className="input" />
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

      {/* Simulación del plan según modalidad */}
      <div className="rounded-xl bg-brand-50 p-4 text-sm ring-1 ring-brand-100">
        <div className="font-semibold text-brand-700">Plan simulado</div>
        <div className="mt-1 text-slate-700">
          {preview.numeroCuotas > 0
            ? <>{preview.numeroCuotas} cuotas {MODAL_LABEL[modalidad]} de <b>{money(preview.cuota)}</b></>
            : 'Completa monto y plazo para ver el plan.'}
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

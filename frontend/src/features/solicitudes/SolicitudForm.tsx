import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { solicitudSchema, type SolicitudForm as TForm, calcularPreview } from './schema';
import { useCrearSolicitud } from './hooks';
import { money } from '@/lib/format';


export function SolicitudForm({ clienteId, areaId }: { clienteId: number; areaId: number }) {
  const crear = useCrearSolicitud();
  const { register, handleSubmit, watch, formState: { errors } } = useForm<TForm>({
    resolver: zodResolver(solicitudSchema),
    defaultValues: {
      cliente_id: clienteId, area_id: areaId, seguro_exonerado: false,
      porcentaje_seguro: 0.1, tasa_interes: 0.2, numero_cuotas: 10, modalidad: 'MENSUAL',
    },
  });

  const valores = watch();
  const preview = calcularPreview(valores);
  const exonerado = watch('seguro_exonerado');

  const onSubmit = (data: TForm) => crear.mutate(data);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-lg">
      <div>
        <label className="block text-sm font-medium">Capital solicitado</label>
        <input type="number" step="any" {...register('capital_solicitado', { valueAsNumber: true })}
          className="input" />
      </div>
      <div>
        <label className="block text-sm font-medium">Monto aprobado</label>
        <input type="number" step="any" {...register('monto_aprobado', { valueAsNumber: true })}
          className="input" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium">Tasa interés mensual (0–1)</label>
          <input type="number" step="any" {...register('tasa_interes', { valueAsNumber: true })}
            className="input" />
        </div>
        <div>
          <label className="block text-sm font-medium">N° cuotas</label>
          <input type="number" {...register('numero_cuotas', { valueAsNumber: true })}
            className="input" />
        </div>
      </div>

      <label className="flex items-center gap-2">
        <input type="checkbox" {...register('seguro_exonerado')} />
        <span className="text-sm">Exonerar seguro (requiere aprobación de Administrador)</span>
      </label>

      {!exonerado ? (
        <div>
          <label className="block text-sm font-medium">% Seguro (0.05–0.10)</label>
          <input type="number" step="0.01" {...register('porcentaje_seguro', { valueAsNumber: true })}
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

      <div className="rounded-xl bg-slate-50 p-4 text-sm space-y-1.5 ring-1 ring-slate-100">
        <div className="flex justify-between"><span>Valor seguro</span><b>{money(preview.valorSeguro)}</b></div>
        <div className="flex justify-between"><span>Monto desembolsado (neto)</span><b>{money(preview.desembolsado)}</b></div>
        <div className="flex justify-between"><span>Intereses (sobre aprobado)</span><b>{money(preview.interes)}</b></div>
        <div className="flex justify-between"><span className="font-medium text-slate-700">Total a recaudar</span><b>{money(preview.totalRecaudar)}</b></div>
        <div className="flex justify-between"><span>Valor cuota</span><b>{money(preview.cuota)}</b></div>
      </div>

      <button type="submit" disabled={crear.isPending}
        className="btn-primary">
        {crear.isPending ? 'Guardando…' : 'Crear solicitud'}
      </button>
    </form>
  );
}

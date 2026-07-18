import type { EstadoSolicitud } from '@/types';

// color del punto + fondo/textos suaves por estado
const estilos: Record<string, { wrap: string; dot: string }> = {
  BORRADOR:                { wrap: 'bg-surface-3 text-slate-600', dot: 'bg-slate-400' },
  PENDIENTE_SUPERVISOR:    { wrap: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200', dot: 'bg-amber-500' },
  PENDIENTE_ADMINISTRADOR: { wrap: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200', dot: 'bg-orange-500' },
  APROBADO:                { wrap: 'bg-brand-50 text-brand-700 ring-1 ring-brand-100', dot: 'bg-brand-500' },
  RECHAZADO:               { wrap: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200', dot: 'bg-rose-500' },
  DESEMBOLSADO:            { wrap: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200', dot: 'bg-indigo-500' },
  ACTIVO:                  { wrap: 'bg-money-50 text-money-700 ring-1 ring-money-100', dot: 'bg-money-500' },
  EN_MORA:                 { wrap: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200', dot: 'bg-amber-600' },
  PAGADO:                  { wrap: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', dot: 'bg-emerald-500' },
  FINALIZADO:              { wrap: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', dot: 'bg-emerald-500' },
  REAMORTIZADO:            { wrap: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200', dot: 'bg-violet-500' },
  REFINANCIADO:            { wrap: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200', dot: 'bg-purple-500' },
  CANCELADO:               { wrap: 'bg-surface-3 text-slate-600', dot: 'bg-slate-400' },
  CASTIGADO:               { wrap: 'bg-rose-100 text-rose-800', dot: 'bg-rose-600' },
};

export function EstadoBadge({ estado }: { estado: EstadoSolicitud }) {
  const s = estilos[estado] ?? estilos.BORRADOR;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${s.wrap}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {estado.replace(/_/g, ' ')}
    </span>
  );
}

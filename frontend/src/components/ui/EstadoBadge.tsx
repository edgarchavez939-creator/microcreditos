import type { EstadoSolicitud } from '@/types';

const estilos: Record<string, string> = {
  BORRADOR: 'bg-slate-100 text-slate-600',
  PENDIENTE_SUPERVISOR: 'bg-yellow-100 text-yellow-800',
  PENDIENTE_ADMINISTRADOR: 'bg-orange-100 text-orange-800',
  APROBADO: 'bg-teal-100 text-teal-800',
  RECHAZADO: 'bg-red-100 text-red-700',
  DESEMBOLSADO: 'bg-indigo-100 text-indigo-800',
  ACTIVO: 'bg-green-100 text-green-800',
  EN_MORA: 'bg-amber-100 text-amber-900',
  PAGADO: 'bg-blue-100 text-blue-800',
  FINALIZADO: 'bg-blue-100 text-blue-800',
  REAMORTIZADO: 'bg-slate-200 text-slate-700',
  REFINANCIADO: 'bg-purple-100 text-purple-800',
  CANCELADO: 'bg-red-100 text-red-700',
  CASTIGADO: 'bg-red-200 text-red-900',
};

export function EstadoBadge({ estado }: { estado: EstadoSolicitud }) {
  const cls = estilos[estado] ?? 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {estado.replace(/_/g, ' ')}
    </span>
  );
}

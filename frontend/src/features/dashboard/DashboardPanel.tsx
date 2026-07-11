import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useState } from 'react';
import { api } from '@/lib/api/client';
import { money } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import { useAreas } from '@/features/clientes/hooks';
import { SkeletonIndicadores } from '@/components/ui/Skeleton';
const DashboardGraficas = lazy(() => import('./DashboardGraficas').then((m) => ({ default: m.DashboardGraficas })));

interface Indicadores {
  prestado: number;
  por_recaudar: number;
  recuperado: number;
  saldo_en_calle: number;
  recaudado_hoy: number;
  cobros_hoy: { cantidad: number; total: number };
  mora: { cantidad: number; total: number };
  creditos_activos: number;
  pendientes_aprobacion: number;
  exoneraciones_pendientes: number;
}

function useIndicadores(areas: number[]) {
  return useQuery({
    queryKey: ['dashboard', areas.join(',')],
    queryFn: async () => (await api.get<{ data: Indicadores }>('/dashboard', {
      params: areas.length ? { areas: areas.join(',') } : undefined,
    })).data.data,
    refetchInterval: 60_000, // refresca cada minuto
  });
}

export function DashboardPanel() {
  const rol = useAuthStore((s) => s.usuario?.rol);
  const [areas, setAreas] = useState<number[]>([]);
  const { data: d, isLoading, isError } = useIndicadores(areas);
  const alcance = rol === 'COBRADOR' ? 'de tu cartera' : rol === 'SUPERVISOR' ? 'de tus áreas' : 'de toda la operación';
  const puedeFiltrar = rol === 'ADMINISTRADOR' || rol === 'SUPERVISOR';

  return (
    <div>
      <h2 className="page-title">Inicio</h2>
      <p className="mb-4 text-sm text-slate-500">Resumen {alcance} al día de hoy.</p>

      {puedeFiltrar && <FiltroAreas seleccion={areas} onCambio={setAreas} />}

      {isLoading ? (
        <SkeletonIndicadores cantidad={8} />
      ) : isError || !d ? (
        <p className="alert-error">No se pudieron cargar los indicadores. Intenta recargar.</p>
      ) : (
        <div className="space-y-5">
          {/* Lo urgente de hoy */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Tarjeta titulo="Cobros de hoy" valor={money(d.cobros_hoy.total)}
              detalle={`${d.cobros_hoy.cantidad} cuota${d.cobros_hoy.cantidad === 1 ? '' : 's'} vence${d.cobros_hoy.cantidad === 1 ? '' : 'n'} hoy`}
              tono="brand" />
            <Tarjeta titulo="Recaudado hoy" valor={money(d.recaudado_hoy)}
              detalle="Pagos registrados en el día" tono="money" />
            <Tarjeta titulo="En mora" valor={money(d.mora.total)}
              detalle={`${d.mora.cantidad} cuota${d.mora.cantidad === 1 ? '' : 's'} vencida${d.mora.cantidad === 1 ? '' : 's'}`}
              tono={d.mora.cantidad > 0 ? 'alerta' : 'neutro'} />
          </div>

          {/* La cartera en general */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tarjeta titulo="Capital prestado" valor={money(d.prestado)} detalle="Créditos desembolsados" />
            <Tarjeta titulo="Total a recaudar" valor={money(d.por_recaudar)} detalle="Capital + intereses vigentes" />
            <Tarjeta titulo="Recuperado" valor={money(d.recuperado)} detalle="Suma de pagos recibidos" />
            <Tarjeta titulo="Saldo en calle" valor={money(d.saldo_en_calle)} detalle="Pendiente por cobrar" />
          </div>

          {/* Gestión */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Tarjeta titulo="Créditos activos" valor={`${d.creditos_activos}`} detalle="En curso" />
            <Tarjeta titulo="Pendientes de aprobación" valor={`${d.pendientes_aprobacion}`} detalle="Esperando decisión" />
            <Tarjeta titulo="Exoneraciones pendientes" valor={`${d.exoneraciones_pendientes}`}
              detalle="Requieren administrador" tono={d.exoneraciones_pendientes > 0 ? 'alerta' : 'neutro'} />
          </div>

          <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-slate-100" />}>
            <DashboardGraficas areas={areas} />
          </Suspense>
        </div>
      )}
    </div>
  );
}

const TONOS: Record<string, string> = {
  brand:  'bg-brand-50 ring-brand-100 text-brand-700',
  money:  'bg-money-50 ring-money-100 text-money-700',
  alerta: 'bg-amber-50 ring-amber-100 text-amber-800',
  neutro: 'bg-white ring-slate-100 text-slate-800',
};

function Tarjeta({ titulo, valor, detalle, tono = 'neutro' }:
  { titulo: string; valor: string; detalle?: string; tono?: string }) {
  return (
    <div className={`rounded-2xl p-4 shadow-card ring-1 ${TONOS[tono]}`}>
      <div className="text-xs font-medium uppercase tracking-wide opacity-70">{titulo}</div>
      <div className="mt-1 font-display text-2xl font-bold">{valor}</div>
      {detalle && <div className="mt-0.5 text-xs opacity-70">{detalle}</div>}
    </div>
  );
}

function FiltroAreas({ seleccion, onCambio }: { seleccion: number[]; onCambio: (a: number[]) => void }) {
  const { data: areas } = useAreas();
  if (!areas || areas.length === 0) return null;

  const toggle = (id: number) => {
    onCambio(seleccion.includes(id) ? seleccion.filter((x) => x !== id) : [...seleccion, id]);
  };

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <button onClick={() => onCambio([])}
        className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${seleccion.length === 0 ? 'bg-brand-500 text-white ring-brand-500' : 'bg-white text-slate-600 ring-slate-200 hover:ring-brand-300'}`}>
        Todas
      </button>
      {areas.map((a) => (
        <button key={a.id} onClick={() => toggle(a.id)}
          className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${seleccion.includes(a.id) ? 'bg-brand-500 text-white ring-brand-500' : 'bg-white text-slate-600 ring-slate-200 hover:ring-brand-300'}`}>
          {a.nombre}
        </button>
      ))}
    </div>
  );
}

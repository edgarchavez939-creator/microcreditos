import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { money } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';

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

function useIndicadores() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get<{ data: Indicadores }>('/dashboard')).data.data,
    refetchInterval: 60_000, // refresca cada minuto
  });
}

export function DashboardPanel() {
  const { data: d, isLoading, isError } = useIndicadores();
  const rol = useAuthStore((s) => s.usuario?.rol);
  const alcance = rol === 'COBRADOR' ? 'de tu cartera' : rol === 'SUPERVISOR' ? 'de tus áreas' : 'de toda la operación';

  return (
    <div>
      <h2 className="mb-1 text-xl font-bold">Inicio</h2>
      <p className="mb-5 text-sm text-slate-500">Resumen {alcance} al día de hoy.</p>

      {isLoading ? (
        <p className="text-sm text-slate-500">Cargando indicadores…</p>
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

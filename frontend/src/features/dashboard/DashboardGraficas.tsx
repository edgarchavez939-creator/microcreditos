import { useQuery } from '@tanstack/react-query';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from '@/lib/api/client';
import { money } from '@/lib/format';

interface Graficas {
  recaudo: Array<{ dia: string; total: number }>;
  cartera_area: Array<{ area: string; saldo: number }>;
  mora: Array<{ area: string; vencido: number; al_dia: number }>;
}

const COLORES = ['#4f46e5', '#16a34a', '#f59e0b', '#e11d48', '#0891b2', '#7c3aed', '#65a30d'];

function useGraficas(areas: number[]) {
  return useQuery({
    queryKey: ['dashboard-graficas', areas.join(',')],
    queryFn: async () => (await api.get<{ data: Graficas }>('/dashboard/graficas', {
      params: areas.length ? { areas: areas.join(',') } : undefined,
    })).data.data,
    refetchInterval: 120_000,
  });
}

const corto = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${n}`;
};

export function DashboardGraficas({ areas }: { areas: number[] }) {
  const { data, isLoading } = useGraficas(areas);

  if (isLoading || !data) {
    return <div className="h-40 animate-pulse rounded-2xl bg-surface-3" />;
  }

  const hayRecaudo = data.recaudo.some((r) => r.total > 0);
  const hayCartera = data.cartera_area.length > 0;
  const hayMora = data.mora.some((m) => m.vencido > 0 || m.al_dia > 0);

  return (
    <div className="space-y-5">
      <div className="card card-pad">
        <h3 className="mb-3 text-sm font-semibold text-content">Evolución del recaudo (últimos 30 días)</h3>
        {hayRecaudo ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data.recaudo} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gRecaudo" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#4f46e5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="dia" tick={{ fontSize: 11, fill: '#94a3b8' }} interval={4} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={corto} tick={{ fontSize: 11, fill: '#94a3b8' }} width={48} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v: number) => [money(v), 'Recaudado']} labelFormatter={(l) => `Día ${l}`} />
              <Area type="monotone" dataKey="total" stroke="#4f46e5" strokeWidth={2} fill="url(#gRecaudo)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-8 text-center text-sm text-content-muted">Aún no hay pagos registrados en el período.</p>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card card-pad">
          <h3 className="mb-3 text-sm font-semibold text-content">Cartera por área (saldo pendiente)</h3>
          {hayCartera ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={data.cartera_area} dataKey="saldo" nameKey="area" cx="50%" cy="50%"
                  outerRadius={85} innerRadius={45} paddingAngle={2}>
                  {data.cartera_area.map((_, i) => <Cell key={i} fill={COLORES[i % COLORES.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => money(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-8 text-center text-sm text-content-muted">Sin cartera activa.</p>
          )}
        </div>

        <div className="card card-pad">
          <h3 className="mb-3 text-sm font-semibold text-content">Al día vs. en mora, por área</h3>
          {hayMora ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.mora} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="area" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={corto} tick={{ fontSize: 11, fill: '#94a3b8' }} width={48} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v: number, n) => [money(v), n === 'al_dia' ? 'Al día' : 'En mora']} />
                <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => (v === 'al_dia' ? 'Al día' : 'En mora')} />
                <Bar dataKey="al_dia" stackId="a" fill="#16a34a" radius={[0, 0, 0, 0]} />
                <Bar dataKey="vencido" stackId="a" fill="#e11d48" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-8 text-center text-sm text-content-muted">Sin datos de mora.</p>
          )}
        </div>
      </div>
    </div>
  );
}

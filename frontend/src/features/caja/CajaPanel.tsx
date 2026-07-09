import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api/client';
import { money, fecha } from '@/lib/format';

interface ResumenDia {
  fecha: string;
  total_ingresos: number;
  total_egresos: number;
  saldo: number;
  numero_pagos: number;
  ya_cerrada: boolean;
}

interface CierreFila {
  id: number;
  fecha: string;
  total_ingresos: number;
  total_egresos: number;
  saldo: number;
  cerrado_por?: string | null;
  area?: string | null;
  created_at: string;
}

export function CajaPanel() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const { data: resumen, isLoading } = useQuery({
    queryKey: ['caja-resumen'],
    queryFn: async () => (await api.get<{ data: ResumenDia }>('/caja/resumen-dia')).data.data,
  });

  const { data: cierres } = useQuery({
    queryKey: ['caja-cierres'],
    queryFn: async () => (await api.get<{ data: CierreFila[] }>('/caja/cierres')).data.data,
  });

  const cerrar = useMutation({
    mutationFn: async () => (await api.post('/caja/cerrar')).data,
    onSuccess: () => {
      setMsg('Caja cerrada ✓');
      qc.invalidateQueries({ queryKey: ['caja-resumen'] });
      qc.invalidateQueries({ queryKey: ['caja-cierres'] });
    },
    onError: (e: unknown) => {
      const x = e as { response?: { data?: { message?: string } } };
      setError(x?.response?.data?.message ?? 'No se pudo cerrar la caja.');
    },
  });

  return (
    <div>
      <h2 className="mb-1 text-xl font-bold">Caja</h2>
      <p className="mb-5 text-sm text-slate-500">Tu movimiento del día y el cierre de caja.</p>

      {isLoading || !resumen ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : (
        <div className="card card-pad mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">Hoy · {fecha(resumen.fecha)}</h3>
            {resumen.ya_cerrada ? (
              <span className="rounded-full bg-money-50 px-3 py-1 text-xs text-money-700 ring-1 ring-money-100">Caja cerrada ✓</span>
            ) : (
              <button
                onClick={() => { setError(null); setMsg(null); cerrar.mutate(); }}
                disabled={cerrar.isPending}
                className="btn-primary btn-sm">
                {cerrar.isPending ? 'Cerrando…' : 'Cerrar caja del día'}
              </button>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Kpi titulo="Recaudado (ingresos)" valor={money(resumen.total_ingresos)}
              detalle={`${resumen.numero_pagos} pago${resumen.numero_pagos === 1 ? '' : 's'}`} />
            <Kpi titulo="Egresos (desembolsos)" valor={money(resumen.total_egresos)} />
            <Kpi titulo="Saldo del día" valor={money(resumen.saldo)} destaque />
          </div>

          {msg && <p className="mt-3 text-sm text-green-700">{msg}</p>}
          {error && <p className="mt-3 alert-error">{error}</p>}
          <p className="mt-2 text-xs text-slate-400">
            El cierre registra los totales de tus movimientos de hoy. Solo puede hacerse una vez por día.
          </p>
        </div>
      )}

      <h3 className="mb-2 text-sm font-semibold text-slate-700">Cierres anteriores</h3>
      {!cierres || cierres.length === 0 ? (
        <p className="text-sm text-slate-500">Aún no hay cierres registrados.</p>
      ) : (
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr><th>Fecha</th><th>Ingresos</th><th>Egresos</th><th>Saldo</th><th>Cerró</th><th>Área</th></tr>
            </thead>
            <tbody>
              {cierres.map((c) => (
                <tr key={c.id} className="border-t">
                  <td>{c.fecha?.slice(0, 10)}</td>
                  <td className="text-right">{money(c.total_ingresos)}</td>
                  <td className="text-right">{money(c.total_egresos)}</td>
                  <td className="text-right font-medium">{money(c.saldo)}</td>
                  <td>{c.cerrado_por ?? '—'}</td>
                  <td>{c.area ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Kpi({ titulo, valor, detalle, destaque }: { titulo: string; valor: string; detalle?: string; destaque?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ring-1 ${destaque ? 'bg-money-50 ring-money-100' : 'bg-slate-50 ring-slate-100'}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{titulo}</div>
      <div className="mt-0.5 font-display text-xl font-bold">{valor}</div>
      {detalle && <div className="text-xs text-slate-400">{detalle}</div>}
    </div>
  );
}

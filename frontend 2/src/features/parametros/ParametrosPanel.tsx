import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

interface Parametro {
  clave: string;
  etiqueta: string;
  tipo: 'porcentaje' | 'dinero' | 'entero';
  descripcion: string;
  valor: number;
}

function useParametros() {
  return useQuery({
    queryKey: ['parametros'],
    queryFn: async () => (await api.get<{ data: Parametro[] }>('/parametros')).data.data,
  });
}

export function ParametrosPanel() {
  const { data, isLoading, isError } = useParametros();

  return (
    <div>
      <h2 className="mb-1 text-xl font-bold">Parámetros</h2>
      <p className="mb-5 text-sm text-slate-500">Configura las reglas generales del sistema. Los cambios aplican de inmediato.</p>

      {isLoading ? (
        <p className="text-sm text-slate-500">Cargando parámetros…</p>
      ) : isError || !data ? (
        <p className="alert-error">No se pudieron cargar los parámetros.</p>
      ) : (
        <div className="max-w-2xl space-y-4">
          {data.map((p) => <FilaParametro key={p.clave} p={p} />)}
        </div>
      )}
    </div>
  );
}

function FilaParametro({ p }: { p: Parametro }) {
  const qc = useQueryClient();
  // Los porcentajes se muestran como 5 = 5% (internamente 0.05)
  const aVista = (v: number) => (p.tipo === 'porcentaje' ? Math.round(v * 10000) / 100 : v);
  const aInterno = (v: number) => (p.tipo === 'porcentaje' ? v / 100 : v);

  const [valor, setValor] = useState(String(aVista(p.valor)));
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const guardar = useMutation({
    mutationFn: async () =>
      (await api.patch('/parametros', { clave: p.clave, valor: aInterno(Number(valor)) })).data,
    onSuccess: () => {
      setMsg('Guardado ✓');
      qc.invalidateQueries({ queryKey: ['parametros'] });
      setTimeout(() => setMsg(null), 2500);
    },
    onError: (e: unknown) => {
      const x = e as { response?: { data?: { message?: string } } };
      setError(x?.response?.data?.message ?? 'No se pudo guardar.');
    },
  });

  const sufijo = p.tipo === 'porcentaje' ? '%' : p.tipo === 'dinero' ? '$' : '';
  const cambiado = Number(valor) !== aVista(p.valor);

  return (
    <div className="card card-pad">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{p.etiqueta}</div>
          <div className="mt-0.5 text-sm text-slate-500">{p.descripcion}</div>
        </div>
        <div className="flex items-center gap-2">
          {sufijo === '$' && <span className="text-sm text-slate-400">$</span>}
          <input type="number" step="any" value={valor}
            onChange={(e) => { setValor(e.target.value); setError(null); }}
            className="input w-32 text-right" />
          {sufijo === '%' && <span className="text-sm text-slate-400">%</span>}
          <button onClick={() => { setError(null); guardar.mutate(); }}
            disabled={guardar.isPending || !cambiado || valor === ''}
            className="btn-primary btn-sm">
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
      {msg && <p className="mt-2 text-sm text-green-700">{msg}</p>}
      {error && <p className="mt-2 alert-error">{error}</p>}
    </div>
  );
}

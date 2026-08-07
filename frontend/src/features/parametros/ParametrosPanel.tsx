import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { InputMoneda } from '@/components/ui/InputMoneda';

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
      <div className="page-header">
        <h2 className="page-title">Parámetros</h2>
        <p className="page-subtitle">
          Reglas generales del negocio. Los cambios aplican de inmediato y afectan
          a los cálculos de créditos nuevos.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-content-muted">Cargando parámetros…</p>
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
    <div className={`card card-pad border-l-4 ${
      p.tipo === 'dinero' ? 'border-l-estado-activo'
      : p.tipo === 'porcentaje' ? 'border-l-estado-info'
      : 'border-l-estado-inactivo'}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-content-strong">{p.etiqueta}</span>
            <span className="rounded-full bg-estado-inactivo-bg px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-estado-inactivo">
              {p.tipo === 'dinero' ? 'valor' : p.tipo === 'porcentaje' ? 'porcentaje' : 'número'}
            </span>
          </div>
          <div className="mt-0.5 text-sm text-content-muted">{p.descripcion}</div>
        </div>
        <div className="flex items-center gap-2">
          {p.tipo === 'dinero' ? (
            <div className="w-44">
              <InputMoneda
                valorPesos={valor === '' ? null : Number(valor)}
                onChangePesos={(v) => { setValor(v === null ? '' : String(v)); setError(null); }}
                mostrarEquivalencia={false}
              />
            </div>
          ) : (
            <>
              <input type="number" step="any" value={valor}
                onChange={(e) => { setValor(e.target.value); setError(null); }}
                className="input w-32 text-right" />
              {sufijo === '%' && <span className="text-sm text-content-muted">%</span>}
            </>
          )}
          <button onClick={() => { setError(null); guardar.mutate(); }}
            disabled={guardar.isPending || !cambiado || valor === ''}
            className="btn-primary btn-sm">
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
      {msg && <p className="mt-2 text-sm text-estado-activo">{msg}</p>}
      {error && <p className="mt-2 alert-error">{error}</p>}
    </div>
  );
}

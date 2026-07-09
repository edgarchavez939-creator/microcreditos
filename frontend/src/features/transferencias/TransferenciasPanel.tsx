import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { money, fechaHora } from '@/lib/format';
import { EstadoVacio, IconosVacio } from '@/components/ui/EstadoVacio';

interface Transferencia {
  id: number;
  banco: string;
  referencia: string;
  valor: number;
  estado: 'PENDIENTE_VALIDACION' | 'APROBADO' | 'RECHAZADO';
  motivo_rechazo?: string | null;
  created_at: string;
  numero_credito?: string | null;
  cliente: string;
  registrado_por?: string | null;
  validado_por?: string | null;
  validado_at?: string | null;
}

const FILTROS = [
  { v: 'PENDIENTE_VALIDACION', t: 'Pendientes' },
  { v: 'APROBADO', t: 'Aprobadas' },
  { v: 'RECHAZADO', t: 'Rechazadas' },
  { v: 'TODAS', t: 'Todas' },
];

function useTransferencias(estado: string) {
  return useQuery({
    queryKey: ['transferencias', estado],
    queryFn: async () =>
      (await api.get<{ data: Transferencia[] }>('/transferencias', { params: { estado } })).data.data,
  });
}

export function TransferenciasPanel() {
  const [estado, setEstado] = useState('PENDIENTE_VALIDACION');
  const { data, isLoading } = useTransferencias(estado);

  return (
    <div>
      <h2 className="mb-1 text-xl font-bold">Transferencias</h2>
      <p className="mb-5 text-sm text-slate-500">Valida los pagos recibidos por transferencia: revisa el comprobante y aprueba o rechaza.</p>

      <div className="mb-4 flex rounded-xl bg-slate-100 p-1 w-fit">
        {FILTROS.map((f) => (
          <button key={f.v} onClick={() => setEstado(f.v)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
              estado === f.v ? 'bg-white text-ink shadow-card' : 'text-slate-500 hover:text-ink'
            }`}>
            {f.t}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">Cargando transferencias…</p>
      ) : !data || data.length === 0 ? (
        <EstadoVacio icono={IconosVacio.transferencia} titulo="Sin transferencias" descripcion="No hay transferencias en este estado por ahora." />
      ) : (
        <div className="space-y-4">
          {data.map((t) => <TarjetaTransferencia key={t.id} t={t} />)}
        </div>
      )}
    </div>
  );
}

function TarjetaTransferencia({ t }: { t: Transferencia }) {
  const qc = useQueryClient();
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [verComprobante, setVerComprobante] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['transferencias'] });
    qc.invalidateQueries({ queryKey: ['cartera'] });   // el saldo del crédito cambia al revertir
    qc.invalidateQueries({ queryKey: ['credito'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const err = (e: unknown) => {
    const x = e as { response?: { data?: { message?: string } } };
    setError(x?.response?.data?.message ?? 'No se pudo completar la acción.');
  };

  const aprobar = useMutation({
    mutationFn: async () => (await api.post(`/transferencias/${t.id}/aprobar`)).data,
    onSuccess: invalidar, onError: err,
  });
  const rechazar = useMutation({
    mutationFn: async () => (await api.post(`/transferencias/${t.id}/rechazar`, { motivo })).data,
    onSuccess: invalidar, onError: err,
  });

  const { data: comprobante, isLoading: cargandoComp, isError: sinComp } = useQuery({
    queryKey: ['transferencia-comprobante', t.id],
    queryFn: async () =>
      (await api.get<{ data: { mime: string; nombre: string; base64: string; fecha_carga?: string; subido_por?: string } }>(
        `/transferencias/${t.id}/comprobante`)).data.data,
    enabled: verComprobante,
    retry: false,
  });

  const pendiente = t.estado === 'PENDIENTE_VALIDACION';

  return (
    <div className="card card-pad">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{t.cliente}{t.numero_credito ? ` · ${t.numero_credito}` : ''}</div>
          <div className="mt-0.5 text-sm text-slate-500">
            {t.banco} · Ref. {t.referencia} · {fechaHora(t.created_at)}
            {t.registrado_por ? ` · Registró: ${t.registrado_por}` : ''}
          </div>
          {t.estado === 'APROBADO' && (
            <div className="mt-1 text-xs text-money-700">Aprobada{t.validado_por ? ` por ${t.validado_por}` : ''}{t.validado_at ? ` · ${fechaHora(t.validado_at)}` : ''}</div>
          )}
          {t.estado === 'RECHAZADO' && (
            <div className="mt-1 text-xs text-rose-600">Rechazada{t.validado_por ? ` por ${t.validado_por}` : ''}: {t.motivo_rechazo}</div>
          )}
        </div>
        <div className="text-right">
          <div className="font-display text-xl font-bold">{money(t.valor)}</div>
          <span className={`rounded-full px-2 py-0.5 text-xs ${
            pendiente ? 'bg-amber-50 text-amber-800' :
            t.estado === 'APROBADO' ? 'bg-money-50 text-money-700' : 'bg-rose-50 text-rose-700'
          }`}>
            {pendiente ? 'Pendiente' : t.estado === 'APROBADO' ? 'Aprobada' : 'Rechazada'}
          </span>
        </div>
      </div>

      <div className="mt-3">
        <button onClick={() => setVerComprobante(!verComprobante)} className="text-sm font-medium text-brand hover:underline">
          {verComprobante ? 'Ocultar comprobante' : 'Ver comprobante'}
        </button>
        {verComprobante && (
          <div className="mt-2">
            {cargandoComp ? (
              <p className="text-sm text-slate-500">Cargando comprobante…</p>
            ) : sinComp || !comprobante ? (
              <p className="text-sm text-amber-700">Esta transferencia no tiene comprobante adjunto.</p>
            ) : (
              <div>
                <img src={`data:${comprobante.mime};base64,${comprobante.base64}`} alt={comprobante.nombre}
                  className="max-h-96 rounded-xl ring-1 ring-slate-200" />
                <p className="mt-1 text-xs text-slate-400">
                  {comprobante.nombre}
                  {comprobante.subido_por ? ` · adjuntado por ${comprobante.subido_por}` : ''}
                  {comprobante.fecha_carga ? ` · ${fechaHora(comprobante.fecha_carga)}` : ''}
                </p>
                <a href={`data:${comprobante.mime};base64,${comprobante.base64}`}
                  download={comprobante.nombre ?? 'comprobante'}
                  className="mt-1 inline-block text-xs font-medium text-brand hover:underline">
                  Descargar comprobante
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      {error && <p className="mt-3 alert-error">{error}</p>}

      {pendiente && (
        !rechazando ? (
          <div className="mt-4 flex gap-2">
            <button onClick={() => { setError(null); aprobar.mutate(); }} disabled={aprobar.isPending}
              className="btn-money btn-sm">
              {aprobar.isPending ? 'Aprobando…' : 'Aprobar'}
            </button>
            <button onClick={() => { setError(null); setRechazando(true); }} className="btn-danger btn-sm">
              Rechazar
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo del rechazo (mín. 5 caracteres)" className="input" />
            <div className="flex gap-2">
              <button onClick={() => { setError(null); rechazar.mutate(); }}
                disabled={rechazar.isPending || motivo.trim().length < 5}
                className="btn btn-sm bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50">
                {rechazar.isPending ? 'Rechazando…' : 'Confirmar rechazo'}
              </button>
              <button onClick={() => setRechazando(false)} className="btn-outline btn-sm">Cancelar</button>
            </div>
          </div>
        )
      )}
    </div>
  );
}

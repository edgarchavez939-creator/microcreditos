import { useState } from 'react';
import { EstadoBadge } from '@/components/ui/EstadoBadge';
import { Icon } from '@/components/ui/icons';
import { money } from '@/lib/format';
import type { Solicitud } from '@/types';
import { useAprobar, useRechazar, useSolicitudesPendientes } from './hooks';

function enlaceWhatsApp(s: Solicitud): string | null {
  const tel = (s.cliente_telefono ?? '').replace(/\D/g, '');
  if (!tel) return null;
  const telFull = tel.length === 10 ? `57${tel}` : tel; // Colombia
  const msg =
    `Hola ${s.cliente ?? ''}, tu crédito ${s.numero_credito ?? ''} fue APROBADO. ✅\n\n` +
    `• Monto aprobado: ${money(s.monto_aprobado)}\n` +
    `• Interés: ${money(s.interes)}\n` +
    `• Total a pagar: ${money(s.total_recaudar)}\n` +
    `• Cuotas: ${s.numero_cuotas} de ${money(s.valor_cuota)}\n\n` +
    `Gracias por confiar en nosotros.`;
  return `https://wa.me/${telFull}?text=${encodeURIComponent(msg)}`;
}

export function AprobacionesPanel() {
  const { data, isLoading } = useSolicitudesPendientes();
  const [aprobado, setAprobado] = useState<Solicitud | null>(null);

  const wa = aprobado ? enlaceWhatsApp(aprobado) : null;

  return (
    <div>
      <h2 className="mb-1 text-xl font-bold">Aprobaciones</h2>
      <p className="mb-5 text-sm text-slate-500">Revisa y resuelve las solicitudes que esperan tu decisión.</p>

      {aprobado && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-money-50 p-4 ring-1 ring-money-100">
          <div className="text-sm text-money-700">
            <b>{aprobado.numero_credito ?? `Crédito #${aprobado.id}`}</b> aprobado. Envía las condiciones al cliente.
          </div>
          <div className="flex items-center gap-2">
            {wa ? (
              <a href={wa} target="_blank" rel="noreferrer" className="btn-money btn-sm">
                <Icon.transferencias /> Enviar por WhatsApp
              </a>
            ) : (
              <span className="text-xs text-slate-500">El cliente no tiene teléfono registrado.</span>
            )}
            <button onClick={() => setAprobado(null)} className="btn-ghost btn-sm">Cerrar</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : !data || data.length === 0 ? (
        <p className="card card-pad border-2 border-dashed border-slate-200 text-center text-sm text-slate-500 shadow-none ring-0">
          No hay solicitudes pendientes de aprobación.
        </p>
      ) : (
        <div className="space-y-4">
          {data.map((s) => <TarjetaAprobacion key={s.id} s={s} onAprobado={setAprobado} />)}
        </div>
      )}
    </div>
  );
}

function TarjetaAprobacion({ s, onAprobado }: { s: Solicitud; onAprobado: (s: Solicitud) => void }) {
  const aprobar = useAprobar();
  const rechazar = useRechazar();
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const err = (e: unknown) => {
    const x = e as { response?: { data?: { message?: string } } };
    setError(x?.response?.data?.message ?? 'No se pudo completar la acción.');
  };

  return (
    <div className="card card-pad">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{s.numero_credito ?? `Crédito #${s.id}`} · {s.cliente ?? `Cliente ${s.cliente_id}`}</div>
          <EstadoBadge estado={s.estado} />
          {s.seguro_exonerado && (
            <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-800">
              Seguro exonerado · requiere administrador
            </span>
          )}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        <Item label="Capital aprobado" value={money(s.monto_aprobado)} />
        <Item label="Seguro" value={money(s.valor_seguro)} />
        <Item label="Interés" value={money(s.interes)} />
        <Item label="Total a recaudar" value={money(s.total_recaudar)} />
        <Item label="Desembolso neto" value={money(s.monto_desembolsado)} />
        <Item label="Cuotas" value={`${s.numero_cuotas}`} />
      </dl>

      {error && <p className="mt-3 alert-error">{error}</p>}

      {!rechazando ? (
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => { setError(null); aprobar.mutate(s.id, { onSuccess: () => onAprobado(s), onError: err }); }}
            disabled={aprobar.isPending}
            className="btn-primary btn-sm">
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
            <button
              onClick={() => { setError(null); rechazar.mutate({ id: s.id, motivo }, { onError: err }); }}
              disabled={rechazar.isPending || motivo.trim().length < 5}
              className="btn btn-sm bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50">
              {rechazar.isPending ? 'Rechazando…' : 'Confirmar rechazo'}
            </button>
            <button onClick={() => setRechazando(false)} className="btn-outline btn-sm">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api/client';
import { money, fecha, fechaHora } from '@/lib/format';
import { ModalGestion, ETIQUETA_TIPO } from './ModalGestion';

interface CreditoMora {
  solicitud_id: number; numero_credito: string; cliente_id: number; cliente: string;
  telefono?: string; direccion?: string; latitud?: number; longitud?: number;
  cobrador?: string; area?: string;
  saldo_vencido: number; dias_mora: number; cuotas_vencidas: number;
  ultima_gestion?: { tipo: string; observacion: string; fecha: string } | null;
  promesa?: { fecha_acuerdo: string; monto_acuerdo: number } | null;
}


function nivelMora(dias: number) {
  if (dias <= 15) return { txt: `${dias}d`, cls: 'bg-estado-pendiente-bg text-estado-pendiente' };
  if (dias <= 30) return { txt: `${dias}d`, cls: 'bg-estado-pendiente-bg text-estado-pendiente' };
  return { txt: `${dias}d`, cls: 'bg-estado-mora-bg text-estado-mora' };
}

export function MoraPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['mora-cartera'],
    queryFn: async () => (await api.get('/mora/cartera')).data,
  });
  const [gestionCliente, setGestionCliente] = useState<CreditoMora | null>(null);
  const [historialCliente, setHistorialCliente] = useState<CreditoMora | null>(null);

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Gestión de mora</h2>
        <p className="page-subtitle">Cobranza y seguimiento de créditos en atraso.</p>
      </div>

      {/* Lo que hay por recuperar, con el detalle de gestión debajo. */}
      {data?.resumen && (
        <div className="mb-5 overflow-hidden rounded-3xl bg-krypta-600 text-white shadow-[0_8px_28px_rgb(15_23_42/0.18)]">
          <div className="px-5 pt-5 sm:px-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
              Saldo vencido por recuperar
            </p>
            <p className="mt-1 font-display text-dato-2xl font-bold tabular-nums tracking-tight">
              {money(data.resumen.saldo_vencido)}
            </p>
          </div>
          <div className="mt-4 grid grid-cols-2 divide-x divide-white/[0.08] border-t border-white/[0.08]">
            <div className="px-4 py-3.5 text-center">
              <p className="font-display text-dato-lg font-bold tabular-nums">{data.resumen.creditos_mora}</p>
              <p className="text-[11px] text-white/55">Créditos en mora</p>
            </div>
            <div className="px-4 py-3.5 text-center">
              <p className="font-display text-dato-lg font-bold tabular-nums text-money-400">{data.resumen.con_promesa}</p>
              <p className="text-[11px] text-white/55">Con promesa de pago</p>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-content-muted">Cargando…</p>
      ) : !data?.data || data.data.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border-token bg-gradient-to-b from-slate-50/80 to-white py-14 text-center">
          <p className="text-base font-semibold text-content">Sin créditos en mora</p>
          <p className="mt-1 text-sm text-content-muted">Toda la cartera visible está al día. ¡Buen trabajo!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(data.data as CreditoMora[]).map((c) => {
            const nm = nivelMora(c.dias_mora);
            return (
              <div key={c.solicitud_id}
                className={`card card-pad border-l-4 ${c.dias_mora > 60 ? 'border-l-estado-bloqueado' : c.dias_mora > 30 ? 'border-l-estado-mora' : 'border-l-estado-pendiente'}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-semibold text-content-strong">{c.cliente}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${nm.cls}`}>{nm.txt} mora</span>
                    </div>
                    <div className="mt-0.5 text-xs text-content-muted">
                      Crédito {c.numero_credito} · {c.cuotas_vencidas} cuota(s) vencida(s)
                      {c.cobrador && ` · ${c.cobrador}`}
                    </div>
                    {c.promesa && (
                      <div className="mt-1 inline-block rounded-lg bg-estado-activo-bg px-2 py-0.5 text-xs text-estado-activo">
                        Promesa: {money(c.promesa.monto_acuerdo)} para el {fecha(c.promesa.fecha_acuerdo)}
                      </div>
                    )}
                    {c.ultima_gestion && (
                      <div className="mt-1 text-xs text-content-muted">
                        Última: {ETIQUETA_TIPO(c.ultima_gestion.tipo)} · {c.ultima_gestion.observacion?.slice(0, 60)}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-display text-dato-lg font-bold tabular-nums text-estado-mora">{money(c.saldo_vencido)}</div>
                    <div className="mt-1 flex gap-1.5">
                      {c.telefono && (
                        <a href={`https://wa.me/57${c.telefono.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                          className="rounded-lg bg-estado-activo-bg px-2 py-1 text-xs font-medium text-estado-activo hover:brightness-95">WhatsApp</a>
                      )}
                      <button onClick={() => setHistorialCliente(c)} className="rounded-lg bg-surface-3 px-2 py-1 text-xs font-medium text-content-muted hover:bg-slate-200">Historial</button>
                      <button onClick={() => setGestionCliente(c)} className="rounded-lg bg-brand-500 px-2 py-1 text-xs font-medium text-white hover:bg-brand-600">Gestionar</button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {gestionCliente && <ModalGestion clienteId={gestionCliente.cliente_id} solicitudId={gestionCliente.solicitud_id} nombre={gestionCliente.cliente} saldo={gestionCliente.saldo_vencido} onClose={() => setGestionCliente(null)} />}
      {historialCliente && <ModalHistorial credito={historialCliente} onClose={() => setHistorialCliente(null)} />}
    </div>
  );
}

function ModalHistorial({ credito, onClose }: { credito: CreditoMora; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ['mora-historial', credito.cliente_id],
    queryFn: async () => (await api.get(`/mora/historial/${credito.cliente_id}`)).data.data as Array<Record<string, unknown>>,
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="animate-fade-in-scale w-full max-w-lg rounded-2xl bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold text-content-strong">Historial de gestiones</h3>
        <p className="mb-4 text-sm text-content-muted">{credito.cliente}</p>
        {!data || data.length === 0 ? (
          <p className="py-6 text-center text-sm text-content-muted">Aún no hay gestiones registradas.</p>
        ) : (
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {data.map((g) => (
              <div key={g.id as number} className="rounded-xl bg-surface-2 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-content">{ETIQUETA_TIPO(g.tipo as string)}</span>
                  <span className="text-xs text-content-muted">{fechaHora(g.created_at as string)}</span>
                </div>
                <p className="mt-1 text-sm text-content-muted">{g.observacion as string}</p>
                {g.fecha_acuerdo != null && (
                  <p className="mt-1 text-xs text-estado-activo">Acuerdo: {money((g.monto_acuerdo as number) ?? 0)} para el {fecha(g.fecha_acuerdo as string)}</p>
                )}
                <p className="mt-1 text-xs text-content-muted">Por: {(g.registrado_por as string) ?? '—'}</p>
              </div>
            ))}
          </div>
        )}
        <button onClick={onClose} className="btn-outline btn-sm mt-4 w-full">Cerrar</button>
      </div>
    </div>
  );
}

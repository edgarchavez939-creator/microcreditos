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
  if (dias <= 15) return { txt: `${dias}d`, cls: 'bg-amber-50 text-amber-800' };
  if (dias <= 30) return { txt: `${dias}d`, cls: 'bg-orange-100 text-orange-800' };
  return { txt: `${dias}d`, cls: 'bg-rose-100 text-rose-700' };
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

      {data?.resumen && (
        <div className="mb-5 grid grid-cols-3 gap-3">
          <div className="card card-pad text-center">
            <div className="font-display text-2xl font-bold text-rose-600">{data.resumen.creditos_mora}</div>
            <div className="text-xs text-content-muted">Créditos en mora</div>
          </div>
          <div className="card card-pad text-center">
            <div className="font-display text-2xl font-bold text-content">{money(data.resumen.saldo_vencido)}</div>
            <div className="text-xs text-content-muted">Saldo vencido</div>
          </div>
          <div className="card card-pad text-center">
            <div className="font-display text-2xl font-bold text-money-700">{data.resumen.con_promesa}</div>
            <div className="text-xs text-content-muted">Con promesa de pago</div>
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
              <div key={c.solicitud_id} className="card card-pad">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-content-strong">{c.cliente}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${nm.cls}`}>{nm.txt} mora</span>
                    </div>
                    <div className="mt-0.5 text-xs text-content-muted">
                      Crédito {c.numero_credito} · {c.cuotas_vencidas} cuota(s) vencida(s)
                      {c.cobrador && ` · ${c.cobrador}`}
                    </div>
                    {c.promesa && (
                      <div className="mt-1 inline-block rounded-lg bg-money-50 px-2 py-0.5 text-xs text-money-700">
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
                    <div className="font-display text-lg font-bold text-rose-600">{money(c.saldo_vencido)}</div>
                    <div className="mt-1 flex gap-1.5">
                      {c.telefono && (
                        <a href={`https://wa.me/57${c.telefono.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                          className="rounded-lg bg-money-50 px-2 py-1 text-xs font-medium text-money-700 hover:bg-money-100">WhatsApp</a>
                      )}
                      <button onClick={() => setHistorialCliente(c)} className="rounded-lg bg-surface-3 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200">Historial</button>
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
                <p className="mt-1 text-sm text-slate-600">{g.observacion as string}</p>
                {g.fecha_acuerdo != null && (
                  <p className="mt-1 text-xs text-money-700">Acuerdo: {money((g.monto_acuerdo as number) ?? 0)} para el {fecha(g.fecha_acuerdo as string)}</p>
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

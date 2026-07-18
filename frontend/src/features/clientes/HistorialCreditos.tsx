import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api/client';
import { money, fecha } from '@/lib/format';
import { EvaluacionRenovacion } from '@/features/cartera/EvaluacionRenovacion';

interface CreditoHistorial {
  id: number;
  numero_credito?: string | null;
  estado: string;
  fecha_solicitud: string;
  fecha_desembolso?: string | null;
  fecha_cancelacion?: string | null;
  monto_aprobado: number;
  capital_solicitado: number;
  plazo_meses: number;
  total_pagado: number;
  numero_cuotas: number;
  max_dias_mora: number;
  creado_por?: string | null;
  aprobado_por?: string | null;
  es_ultimo_pagado: boolean;
  tipo_origen?: string | null;
  credito_origen_id?: number | null;
  credito_origen_numero?: string | null;
  renovado_por_numero?: string | null;
}

const VIGENTES = ['ACTIVO', 'DESEMBOLSADO', 'EN_MORA', 'APROBADO'];

function etiquetaEstado(c: CreditoHistorial): { txt: string; cls: string } {
  if (c.es_ultimo_pagado) return { txt: 'Último crédito cancelado', cls: 'bg-money-50 text-money-700 ring-money-100' };
  if (c.estado === 'PAGADO') return { txt: 'Crédito cancelado', cls: 'bg-surface-3 text-slate-600 ring-border-token' };
  if (VIGENTES.includes(c.estado)) return { txt: 'Crédito vigente', cls: 'bg-brand-50 text-brand-700 ring-brand-100' };
  if (c.estado === 'RECHAZADO') return { txt: 'Rechazado', cls: 'bg-rose-50 text-rose-700 ring-rose-100' };
  return { txt: c.estado.replaceAll('_', ' ').toLowerCase(), cls: 'bg-amber-50 text-amber-800 ring-amber-100' };
}

/** HISTORIAL DE CRÉDITOS: todos los créditos del cliente, de cualquier estado. */
export function HistorialCreditos({ clienteId }: { clienteId: number }) {
  const { data: creditos, isLoading } = useQuery({
    queryKey: ['historial-creditos', clienteId],
    queryFn: async () => (await api.get<{ data: CreditoHistorial[] }>(`/clientes/${clienteId}/historial-creditos`)).data.data,
  });
  const [expandido, setExpandido] = useState<number | null>(null);

  if (isLoading) return <p className="text-sm text-content-muted">Cargando historial…</p>;
  if (!creditos || creditos.length === 0) {
    return (
      <div className="card card-pad">
        <h3 className="text-sm font-semibold text-content">Historial de créditos</h3>
        <p className="mt-2 text-sm text-content-muted">Este cliente aún no tiene créditos registrados.</p>
      </div>
    );
  }

  return (
    <div className="card card-pad">
      <h3 className="mb-3 text-sm font-semibold text-content">
        Historial de créditos ({creditos.length})
      </h3>
      <div className="space-y-2">
        {creditos.map((c) => {
          const et = etiquetaEstado(c);
          const abierto = expandido === c.id;
          return (
            <div key={c.id} className={`rounded-xl ring-1 ${c.es_ultimo_pagado ? 'ring-money-200' : 'ring-border-token'}`}>
              <div className="flex cursor-pointer flex-wrap items-center justify-between gap-2 p-3"
                onClick={() => setExpandido(abierto ? null : c.id)}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-content">{c.numero_credito ?? `Crédito #${c.id}`}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ring-1 ${et.cls}`}>{et.txt}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-content-muted">
                    Solicitado {fecha(c.fecha_solicitud)}
                    {c.fecha_cancelacion && ` · Cancelado ${fecha(c.fecha_cancelacion)}`}
                  </div>
                  {(c.tipo_origen === 'RENOVACION' || c.renovado_por_numero) && (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {c.tipo_origen === 'RENOVACION' && (
                        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700 ring-1 ring-brand-100">
                          ↻ Renovación del crédito {c.credito_origen_numero ?? `#${c.credito_origen_id}`}
                        </span>
                      )}
                      {c.renovado_por_numero && (
                        <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs text-content-muted ring-1 ring-border-token">
                          Renovado por el crédito {c.renovado_por_numero}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="font-display text-base font-bold tabular-nums">{money(c.monto_aprobado || c.capital_solicitado)}</div>
                    <div className="text-xs text-content-muted">{c.plazo_meses} meses</div>
                  </div>
                  <span className="text-slate-300">{abierto ? '▲' : '▼'}</span>
                </div>
              </div>

              {abierto && (
                <div className="border-t border-slate-100 p-3">
                  <div className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
                    {[
                      ['Fecha de solicitud', fecha(c.fecha_solicitud)],
                      ['Fecha de desembolso', c.fecha_desembolso ? fecha(c.fecha_desembolso) : '—'],
                      ['Fecha de cancelación', c.fecha_cancelacion ? fecha(c.fecha_cancelacion) : '—'],
                      ['Monto aprobado', money(c.monto_aprobado)],
                      ['Total pagado', money(c.total_pagado)],
                      ['Cuotas', String(c.numero_cuotas)],
                      ['Mora máxima', c.max_dias_mora > 0 ? `${c.max_dias_mora} días` : 'Sin mora'],
                      ['Creó la solicitud', c.creado_por ?? '—'],
                      ['Aprobó', c.aprobado_por ?? '—'],
                    ].map(([l, v]) => (
                      <div key={l} className="flex justify-between border-b border-slate-50 py-0.5">
                        <span className="text-content-muted">{l}</span>
                        <span className="font-medium tabular-nums">{v}</span>
                      </div>
                    ))}
                  </div>

                  {/* Evaluar renovación: SOLO en el último crédito cancelado */}
                  {c.es_ultimo_pagado && (
                    <div className="mt-3">
                      <EvaluacionRenovacion creditoId={c.id} />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

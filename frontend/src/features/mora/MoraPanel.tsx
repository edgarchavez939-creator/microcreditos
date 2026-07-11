import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api/client';
import { money, fecha, fechaHora } from '@/lib/format';
import { useToast } from '@/components/ui/Toast';

interface CreditoMora {
  solicitud_id: number; numero_credito: string; cliente_id: number; cliente: string;
  telefono?: string; direccion?: string; latitud?: number; longitud?: number;
  cobrador?: string; area?: string;
  saldo_vencido: number; dias_mora: number; cuotas_vencidas: number;
  ultima_gestion?: { tipo: string; observacion: string; fecha: string } | null;
  promesa?: { fecha_acuerdo: string; monto_acuerdo: number } | null;
}

const TIPO_GESTION = [
  { v: 'LLAMADA', t: 'Llamada' },
  { v: 'VISITA', t: 'Visita' },
  { v: 'ACUERDO_PAGO', t: 'Acuerdo de pago' },
  { v: 'OBSERVACION', t: 'Observación' },
];
const ETIQUETA_TIPO = (v: string) => TIPO_GESTION.find((t) => t.v === v)?.t ?? v;

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
            <div className="text-xs text-slate-500">Créditos en mora</div>
          </div>
          <div className="card card-pad text-center">
            <div className="font-display text-2xl font-bold text-slate-700">{money(data.resumen.saldo_vencido)}</div>
            <div className="text-xs text-slate-500">Saldo vencido</div>
          </div>
          <div className="card card-pad text-center">
            <div className="font-display text-2xl font-bold text-money-700">{data.resumen.con_promesa}</div>
            <div className="text-xs text-slate-500">Con promesa de pago</div>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : !data?.data || data.data.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-gradient-to-b from-slate-50/80 to-white py-14 text-center">
          <p className="text-base font-semibold text-slate-700">Sin créditos en mora</p>
          <p className="mt-1 text-sm text-slate-500">Toda la cartera visible está al día. ¡Buen trabajo!</p>
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
                      <span className="font-semibold text-slate-800">{c.cliente}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${nm.cls}`}>{nm.txt} mora</span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      Crédito {c.numero_credito} · {c.cuotas_vencidas} cuota(s) vencida(s)
                      {c.cobrador && ` · ${c.cobrador}`}
                    </div>
                    {c.promesa && (
                      <div className="mt-1 inline-block rounded-lg bg-money-50 px-2 py-0.5 text-xs text-money-700">
                        Promesa: {money(c.promesa.monto_acuerdo)} para el {fecha(c.promesa.fecha_acuerdo)}
                      </div>
                    )}
                    {c.ultima_gestion && (
                      <div className="mt-1 text-xs text-slate-400">
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
                      <button onClick={() => setHistorialCliente(c)} className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200">Historial</button>
                      <button onClick={() => setGestionCliente(c)} className="rounded-lg bg-brand-500 px-2 py-1 text-xs font-medium text-white hover:bg-brand-600">Gestionar</button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {gestionCliente && <ModalGestion credito={gestionCliente} onClose={() => setGestionCliente(null)} />}
      {historialCliente && <ModalHistorial credito={historialCliente} onClose={() => setHistorialCliente(null)} />}
    </div>
  );
}

function ModalGestion({ credito, onClose }: { credito: CreditoMora; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [tipo, setTipo] = useState('LLAMADA');
  const [observacion, setObservacion] = useState('');
  const [fechaAcuerdo, setFechaAcuerdo] = useState('');
  const [montoAcuerdo, setMontoAcuerdo] = useState('');
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);

  const capturarGps = () => {
    if (!navigator.geolocation) { toast.error('GPS no disponible.'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }); toast.exito('Ubicación capturada ✓'); },
      () => toast.error('No se pudo obtener la ubicación.'),
    );
  };

  const registrar = useMutation({
    mutationFn: async () => (await api.post('/mora/gestion', {
      cliente_id: credito.cliente_id,
      solicitud_id: credito.solicitud_id,
      tipo, observacion,
      fecha_acuerdo: tipo === 'ACUERDO_PAGO' ? fechaAcuerdo : undefined,
      monto_acuerdo: tipo === 'ACUERDO_PAGO' && montoAcuerdo ? Number(montoAcuerdo) : undefined,
      latitud: gps?.lat, longitud: gps?.lng,
    })).data,
    onSuccess: () => { toast.exito('Gestión registrada ✓'); qc.invalidateQueries({ queryKey: ['mora-cartera'] }); onClose(); },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo registrar.'),
  });

  const esAcuerdo = tipo === 'ACUERDO_PAGO';
  const puede = observacion.trim() !== '' && (!esAcuerdo || fechaAcuerdo !== '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="animate-fade-in-scale w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold text-slate-800">Gestión de cobranza</h3>
        <p className="mb-4 text-sm text-slate-500">{credito.cliente} · {money(credito.saldo_vencido)} vencido</p>

        <label className="label">Tipo de gestión</label>
        <div className="mb-3 grid grid-cols-2 gap-1.5">
          {TIPO_GESTION.map((t) => (
            <button key={t.v} onClick={() => setTipo(t.v)}
              className={`rounded-lg px-3 py-2 text-sm font-medium ring-1 transition ${tipo === t.v ? 'bg-brand-500 text-white ring-brand-500' : 'bg-white text-slate-600 ring-slate-200 hover:ring-brand-300'}`}>
              {t.t}
            </button>
          ))}
        </div>

        <label className="label">Observación</label>
        <textarea value={observacion} onChange={(e) => setObservacion(e.target.value)} className="input" rows={3}
          placeholder="Detalle de la gestión…" />

        {esAcuerdo && (
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-money-50 p-3">
            <div>
              <label className="label text-xs">Fecha comprometida</label>
              <input type="date" value={fechaAcuerdo} onChange={(e) => setFechaAcuerdo(e.target.value)} className="input py-1 text-sm" />
            </div>
            <div>
              <label className="label text-xs">Monto acordado</label>
              <input type="number" value={montoAcuerdo} onChange={(e) => setMontoAcuerdo(e.target.value)} className="input py-1 text-sm" placeholder="Opcional" />
            </div>
          </div>
        )}

        {tipo === 'VISITA' && (
          <button onClick={capturarGps} className="mt-3 w-full rounded-lg bg-slate-100 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200">
            {gps ? '✓ Ubicación capturada' : '📍 Capturar ubicación de la visita'}
          </button>
        )}

        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="btn-outline btn-sm flex-1">Cancelar</button>
          <button onClick={() => registrar.mutate()} disabled={!puede || registrar.isPending} className="btn-primary btn-sm flex-1">
            {registrar.isPending && <span className="spinner" />}Registrar
          </button>
        </div>
      </div>
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
      <div className="animate-fade-in-scale w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold text-slate-800">Historial de gestiones</h3>
        <p className="mb-4 text-sm text-slate-500">{credito.cliente}</p>
        {!data || data.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">Aún no hay gestiones registradas.</p>
        ) : (
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {data.map((g) => (
              <div key={g.id as number} className="rounded-xl bg-slate-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">{ETIQUETA_TIPO(g.tipo as string)}</span>
                  <span className="text-xs text-slate-400">{fechaHora(g.created_at as string)}</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{g.observacion as string}</p>
                {g.fecha_acuerdo != null && (
                  <p className="mt-1 text-xs text-money-700">Acuerdo: {money((g.monto_acuerdo as number) ?? 0)} para el {fecha(g.fecha_acuerdo as string)}</p>
                )}
                <p className="mt-1 text-xs text-slate-400">Por: {(g.registrado_por as string) ?? '—'}</p>
              </div>
            ))}
          </div>
        )}
        <button onClick={onClose} className="btn-outline btn-sm mt-4 w-full">Cerrar</button>
      </div>
    </div>
  );
}

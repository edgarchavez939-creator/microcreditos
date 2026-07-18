import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api/client';
import { money } from '@/lib/format';
import { useToast } from '@/components/ui/Toast';

export const TIPO_GESTION = [
  { v: 'LLAMADA', t: 'Llamada' },
  { v: 'VISITA', t: 'Visita' },
  { v: 'ACUERDO_PAGO', t: 'Acuerdo de pago' },
  { v: 'OBSERVACION', t: 'Observación' },
];
export const ETIQUETA_TIPO = (v: string) => TIPO_GESTION.find((t) => t.v === v)?.t ?? v;

interface Props {
  clienteId: number;
  solicitudId?: number;
  nombre: string;
  saldo?: number;
  onClose: () => void;
  /** queryKeys a invalidar tras registrar (ruta, mora, etc.) */
  invalidar?: string[][];
}

export function ModalGestion({ clienteId, solicitudId, nombre, saldo, onClose, invalidar = [] }: Props) {
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
      cliente_id: clienteId,
      solicitud_id: solicitudId,
      tipo, observacion,
      fecha_acuerdo: tipo === 'ACUERDO_PAGO' ? fechaAcuerdo : undefined,
      monto_acuerdo: tipo === 'ACUERDO_PAGO' && montoAcuerdo ? Number(montoAcuerdo) : undefined,
      latitud: gps?.lat, longitud: gps?.lng,
    })).data,
    onSuccess: () => {
      toast.exito('Gestión registrada ✓');
      [['mora-cartera'], ['ruta-dia'], ...invalidar].forEach((k) => qc.invalidateQueries({ queryKey: k }));
      onClose();
    },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo registrar.'),
  });

  const esAcuerdo = tipo === 'ACUERDO_PAGO';
  const puede = observacion.trim() !== '' && (!esAcuerdo || fechaAcuerdo !== '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="animate-fade-in-scale w-full max-w-md rounded-2xl bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold text-content-strong">Gestión de cobranza</h3>
        <p className="mb-4 text-sm text-content-muted">{nombre}{saldo != null ? ` · ${money(saldo)} vencido` : ''}</p>

        <label className="label">Tipo de gestión</label>
        <div className="mb-3 grid grid-cols-2 gap-1.5">
          {TIPO_GESTION.map((t) => (
            <button key={t.v} onClick={() => setTipo(t.v)}
              className={`rounded-lg px-3 py-2 text-sm font-medium ring-1 transition ${tipo === t.v ? 'bg-brand-500 text-white ring-brand-500' : 'bg-surface text-slate-600 ring-border-token hover:ring-brand-300'}`}>
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
          <button onClick={capturarGps} className="mt-3 w-full rounded-lg bg-surface-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200">
            {gps ? '✓ Ubicación capturada' : '📍 Capturar ubicación de la visita'}
          </button>
        )}

        {esAcuerdo && (
          <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
            Al registrar un acuerdo, este cliente no aparecerá en la ruta hasta la fecha comprometida.
          </p>
        )}
        {!esAcuerdo && (
          <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-xs text-content-muted">
            Al registrar la gestión, el cliente sale de la ruta de hoy y reaparece mañana si sigue debiendo.
          </p>
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

import { useState } from 'react';
import { EstadoBadge } from '@/components/ui/EstadoBadge';
import { Icon } from '@/components/ui/icons';
import { money } from '@/lib/format';
import type { Solicitud } from '@/types';
import { useToast } from '@/components/ui/Toast';
import { SkeletonTarjetas } from '@/components/ui/Skeleton';
import { useAprobar, useRechazar, useSolicitudesPendientes } from './hooks';
import { PERIODOS_POR_MES } from '@/features/solicitudes/schema';
import { EstadoVacio, IconosVacio } from '@/components/ui/EstadoVacio';

const MOD_LABEL: Record<string, string> = {
  MENSUAL: 'Mensual', QUINCENAL: 'Quincenal', SEMANAL: 'Semanal', DIARIO: 'Diario',
};

function enlaceWhatsApp(s: Solicitud): string | null {
  const tel = (s.cliente_telefono ?? '').replace(/\D/g, '');
  if (!tel) return null;
  const telFull = tel.length === 10 ? `57${tel}` : tel; // Colombia
  const cuota = s.valor_cuota || (s.numero_cuotas ? s.total_recaudar / s.numero_cuotas : 0);
  const msg =
    `Hola, ${s.cliente ?? ''}. 💰\n\n` +
    `Nos complace informarte que tu crédito ${s.numero_credito ?? ''} ha sido aprobado.\n\n` +
    `Detalles de la aprobación:\n` +
    `• Monto aprobado: ${money(s.monto_aprobado)}\n` +
    `• Intereses: ${money(s.interes)}\n` +
    `• Seguro: ${money(s.valor_seguro)}\n` +
    `• Total a pagar: ${money(s.total_recaudar)}\n` +
    `• Número de cuotas: ${s.numero_cuotas}\n` +
    `• Forma de pago: ${MOD_LABEL[s.modalidad ?? ''] ?? s.modalidad ?? ''}\n` +
    `• Valor de cada cuota: ${money(cuota)}\n\n` +
    `Recuerda realizar el pago oportuno de tus cuotas para mantener un buen historial de crédito.\n\n` +
    `¡Gracias por confiar en nosotros! Si tienes alguna inquietud, estaremos atentos para ayudarte.`;
  return `https://wa.me/${telFull}?text=${encodeURIComponent(msg)}`;
}

export function AprobacionesPanel() {
  const { data, isLoading } = useSolicitudesPendientes();
  const [aprobado, setAprobado] = useState<Solicitud | null>(null);

  const wa = aprobado ? enlaceWhatsApp(aprobado) : null;

  return (
    <div>
      <h2 className="page-title">Aprobaciones</h2>
      <p className="mb-5 text-sm text-content-muted">Revisa y resuelve las solicitudes que esperan tu decisión.</p>

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
              <span className="text-xs text-content-muted">El cliente no tiene teléfono registrado.</span>
            )}
            <button onClick={() => setAprobado(null)} className="btn-ghost btn-sm">Cerrar</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <SkeletonTarjetas cantidad={2} />
      ) : !data || data.length === 0 ? (
        <EstadoVacio icono={IconosVacio.aprobacion} titulo="Todo al día" descripcion="No hay solicitudes pendientes de aprobación en este momento." />
      ) : (
        <div className="space-y-4">
          {data.map((s) => <TarjetaAprobacion key={s.id} s={s} onAprobado={setAprobado} />)}
        </div>
      )}
    </div>
  );
}

function TarjetaAprobacion({ s, onAprobado }: { s: Solicitud; onAprobado: (s: Solicitud) => void }) {
  const toast = useToast();
  const aprobar = useAprobar();
  const rechazar = useRechazar();
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  // El capital aprobado se define aquí; por defecto se propone el solicitado.
  const [montoAprobado, setMontoAprobado] = useState<number>(s.capital_solicitado ?? 0);

  const err = (e: unknown) => {
    const x = e as { response?: { data?: { message?: string } } };
    setError(x?.response?.data?.message ?? 'No se pudo completar la acción.');
  };

  // Estimación en vivo del plan sobre el monto que se va a aprobar
  const factor = PERIODOS_POR_MES[s.modalidad ?? 'MENSUAL'] ?? 1;
  const plazoMeses = Math.max(1, Math.round((s.numero_cuotas ?? factor) / factor));
  const tasa = Number(s.tasa_interes ?? 0);
  const pctSeguro = s.seguro_exonerado ? 0 : Number(s.porcentaje_seguro ?? 0);
  const valorSeguro = Math.round(montoAprobado * pctSeguro);
  const interes = Math.round(montoAprobado * tasa * plazoMeses);
  const totalRecaudar = Math.round(montoAprobado + interes);
  const desembolso = Math.round(montoAprobado - valorSeguro);
  const cuota = s.numero_cuotas ? Math.round(totalRecaudar / s.numero_cuotas) : 0;

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

      {/* Datos para el análisis de la decisión */}
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        <Item label="Capital solicitado" value={money(s.capital_solicitado)} />
        <Item label="Salario del cliente" value={s.cliente_salario != null ? money(s.cliente_salario) : 'No registrado'} />
        <Item label="Tasa mensual" value={`${(tasa * 100).toFixed(1)}%`} />
        <Item label="Modalidad" value={MOD_LABEL[s.modalidad ?? ''] ?? s.modalidad ?? ''} />
        <Item label="Cuotas" value={`${s.numero_cuotas}`} />
        <Item label="Plazo" value={`${plazoMeses} mes(es)`} />
      </dl>

      {!rechazando && (
        <div className="mt-4 rounded-xl bg-brand-50 p-4 ring-1 ring-brand-100">
          <label className="label">Capital a aprobar</label>
          <input
            type="number" step="any" value={montoAprobado}
            onChange={(e) => setMontoAprobado(Number(e.target.value))}
            className="input max-w-xs" />
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
            <Item label="Seguro" value={money(valorSeguro)} />
            <Item label="Interés" value={money(interes)} />
            <Item label="Total a recaudar" value={money(totalRecaudar)} />
            <Item label="Desembolso neto" value={money(desembolso)} />
            <Item label="Valor cuota" value={money(cuota)} />
          </div>
        </div>
      )}

      {error && <p className="mt-3 alert-error">{error}</p>}

      {!rechazando ? (
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => {
              setError(null);
              if (!montoAprobado || montoAprobado <= 0) { setError('Ingresa el capital a aprobar.'); return; }
              aprobar.mutate({ id: s.id, monto_aprobado: montoAprobado }, {
                onSuccess: (resp) => {
                  const aprobada = (resp?.data ?? resp) as Solicitud;
                  toast.exito(`Crédito de ${s.cliente ?? 'cliente'} aprobado por ${money(montoAprobado)} ✓`);
                  onAprobado({ ...s, ...aprobada });
                },
                onError: err,
              });
            }}
            disabled={aprobar.isPending}
            className="btn-primary btn-sm">
            {aprobar.isPending && <span className="spinner" />}{aprobar.isPending ? 'Aprobando…' : 'Aprobar'}
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
              onClick={() => { setError(null); rechazar.mutate({ id: s.id, motivo }, { onSuccess: () => toast.info('Solicitud rechazada.'), onError: err }); }}
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
      <dt className="text-content-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

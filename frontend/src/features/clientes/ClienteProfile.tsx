import { useState } from 'react';
import { GestorDocumentos } from './GestorDocumentos';
import { usePanorama360, useActualizarContacto, type Panorama360 } from './hooks';
import { Timeline, type HitoTimeline } from '@/components/ui/Timeline';
import { money, fecha, fechaHora } from '@/lib/format';
import { EstadoBadge } from '@/components/ui/EstadoBadge';
import type { EstadoSolicitud } from '@/types';
import { useToast } from '@/components/ui/Toast';

/**
 * CLIENTE 360° — toda la información del cliente en una sola pantalla:
 * encabezado con acciones rápidas, resumen financiero con estados por color,
 * alertas, créditos, timeline de actividad, contacto editable y documentos.
 */
export function ClienteProfile({ clienteId, onVolver, onEditar }:
  { clienteId: number; onVolver: () => void; onEditar?: (c: unknown) => void }) {
  const { data, isLoading } = usePanorama360(clienteId);

  if (isLoading || !data) {
    return (
      <div>
        <button onClick={onVolver} className="mb-3 text-sm text-brand-600 hover:underline">← Volver</button>
        <div className="h-40 animate-pulse rounded-2xl bg-surface-3" />
      </div>
    );
  }

  const c = data.cliente;
  const tel = c.telefono_principal?.replace(/\D/g, '');
  const wa = tel ? `https://wa.me/57${tel}` : null;
  const maps = c.latitud && c.longitud ? `https://www.google.com/maps?q=${c.latitud},${c.longitud}` : null;

  return (
    <div className="space-y-5">
      <button onClick={onVolver} className="text-sm text-brand-600 hover:underline">← Volver a clientes</button>

      {/* ENCABEZADO con avatar y acciones rápidas */}
      <div className="card card-pad">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand-100 font-display text-xl font-bold text-brand-700">
              {(c.nombres?.[0] ?? '') + (c.apellidos?.[0] ?? '')}
            </span>
            <div>
              <h2 className="font-display text-xl font-bold text-content-strong">{c.nombres} {c.apellidos}</h2>
              <p className="text-sm text-content-muted">{c.tipo_documento} {c.numero_documento}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                {c.area && <span className="rounded-full bg-surface-3 px-2 py-0.5 text-content-muted">{c.area}</span>}
                {c.cobrador && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-brand-700">Cobrador: {c.cobrador}</span>}
                {data.mora.cantidad > 0
                  ? <span className="rounded-full bg-rose-50 px-2 py-0.5 font-medium text-rose-700">En mora</span>
                  : <span className="rounded-full bg-money-50 px-2 py-0.5 font-medium text-money-700">Al día</span>}
              </div>
            </div>
          </div>
          {/* ACCIONES RÁPIDAS */}
          <div className="flex flex-wrap gap-2">
            {wa && <a href={wa} target="_blank" rel="noreferrer" className="btn-outline btn-sm">WhatsApp</a>}
            {tel && <a href={`tel:${tel}`} className="btn-outline btn-sm">Llamar</a>}
            {maps && <a href={maps} target="_blank" rel="noreferrer" className="btn-outline btn-sm">Ubicación</a>}
            {onEditar && <button onClick={() => onEditar(c)} className="btn-primary btn-sm">Editar</button>}
          </div>
        </div>
      </div>

      {/* RESUMEN FINANCIERO */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ResumenCard titulo="Saldo actual" valor={money(data.resumen.saldo_actual)}
          detalle={`${data.resumen.creditos_activos} crédito(s) activo(s)`} tono={data.resumen.saldo_actual > 0 ? 'brand' : 'neutro'} />
        <ResumenCard titulo="En mora" valor={money(data.mora.total)}
          detalle={data.mora.cantidad > 0 ? `${data.mora.cantidad} cuota(s) · desde ${fecha(data.mora.desde!)}` : 'Sin cuotas vencidas'}
          tono={data.mora.cantidad > 0 ? 'alerta' : 'positivo'} />
        <ResumenCard titulo="Próxima cuota" valor={data.proxima_cuota ? money(data.proxima_cuota.valor) : '—'}
          detalle={data.proxima_cuota ? `Vence ${fecha(data.proxima_cuota.fecha)}` : 'Sin cuotas pendientes'}
          tono={data.proxima_cuota ? 'atencion' : 'neutro'} />
        <ResumenCard titulo="Histórico pagado" valor={money(data.resumen.pagado_hist)}
          detalle={`${data.resumen.creditos_total} crédito(s) en total`} tono="money" />
      </div>

      {/* ALERTA de renovación disponible */}
      {data.renovacion && (
        <div className="flex items-center justify-between rounded-2xl bg-money-50 px-4 py-3 ring-1 ring-money-100">
          <div className="text-sm text-money-700">
            <b>Renovación disponible.</b> Este cliente puede renovar su crédito.
            {data.renovacion.dias_restantes != null && ` Quedan ${data.renovacion.dias_restantes} días.`}
          </div>
        </div>
      )}

      {/* CRÉDITOS + TIMELINE en dos columnas */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card card-pad">
          <h3 className="mb-3 text-sm font-semibold text-content">Créditos</h3>
          {data.creditos.length === 0 ? (
            <p className="rounded-xl bg-surface-2 py-6 text-center text-sm text-content-muted">Sin créditos registrados.</p>
          ) : (
            <div className="space-y-2">
              {data.creditos.map((cr) => {
                const saldo = Math.max(0, (cr.total_recaudar ?? 0) - (cr.total_pagado ?? 0));
                return (
                  <div key={cr.id} className="rounded-xl bg-surface-2 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-content-strong">{cr.numero_credito ?? `Crédito #${cr.id}`}</span>
                      <EstadoBadge estado={cr.estado as EstadoSolicitud} />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-content-muted">
                      <span>{cr.producto} · {cr.numero_cuotas} cuotas {cr.modalidad?.toLowerCase()}</span>
                      <span className="tabular-nums">Saldo {money(saldo)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card card-pad">
          <h3 className="mb-3 text-sm font-semibold text-content">Actividad reciente</h3>
          <Timeline hitos={data.timeline.map(mapHito)} vacio="Sin pagos ni gestiones registradas." />
        </div>
      </div>

      {/* CONTACTO editable */}
      <ContactoEditable clienteId={clienteId} c={c} />

      {/* DOCUMENTOS */}
      <div className="card card-pad">
        <h3 className="mb-3 text-sm font-semibold text-content">Documentos</h3>
        <GestorDocumentos clienteId={clienteId} />
      </div>
    </div>
  );
}

function mapHito(t: Panorama360['timeline'][number]): HitoTimeline {
  const tono = t.tipo === 'PAGO' ? 'money' : t.titulo.toLowerCase().includes('acuerdo') ? 'atencion' : 'brand';
  return { titulo: t.titulo, detalle: t.detalle, fecha: fechaHora(t.fecha), tono };
}

function ResumenCard({ titulo, valor, detalle, tono }:
  { titulo: string; valor: string; detalle: string; tono: string }) {
  const cls: Record<string, string> = {
    brand: 'bg-brand-50 ring-brand-100 text-brand-700',
    money: 'bg-money-50 ring-money-100 text-money-700',
    alerta: 'bg-rose-50 ring-rose-100 text-rose-700',
    atencion: 'bg-amber-50 ring-amber-100 text-amber-800',
    positivo: 'bg-money-50 ring-money-100 text-money-700',
    neutro: 'bg-surface ring-border-token text-content-strong',
  };
  return (
    <div className={`rounded-2xl p-4 shadow-card ring-1 ${cls[tono] ?? cls.neutro}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-content-muted">{titulo}</div>
      <div className="mt-1 font-display text-lg font-bold tabular-nums">{valor}</div>
      <div className="mt-0.5 text-xs text-content-muted">{detalle}</div>
    </div>
  );
}

function ContactoEditable({ clienteId, c }: { clienteId: number; c: Panorama360['cliente'] }) {
  const toast = useToast();
  const actualizar = useActualizarContacto(clienteId);
  const [editando, setEditando] = useState(false);
  const [correo, setCorreo] = useState(c.correo ?? '');
  const [telefono, setTelefono] = useState(c.telefono_principal ?? '');
  const [direccion, setDireccion] = useState(c.direccion ?? '');

  const guardar = () => {
    actualizar.mutate(
      { correo, telefono_principal: telefono, direccion },
      { onSuccess: () => { toast.exito('Contacto actualizado ✓'); setEditando(false); },
        onError: () => toast.error('No se pudo actualizar.') },
    );
  };

  return (
    <div className="card card-pad">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-content">Información de contacto</h3>
        {!editando && <button onClick={() => setEditando(true)} className="text-sm text-brand-600 hover:underline">Editar</button>}
      </div>
      {editando ? (
        <div className="space-y-3">
          <div><label className="label">Teléfono</label><input value={telefono} onChange={(e) => setTelefono(e.target.value)} className="input" /></div>
          <div><label className="label">Correo</label><input value={correo} onChange={(e) => setCorreo(e.target.value)} className="input" /></div>
          <div><label className="label">Dirección</label><input value={direccion} onChange={(e) => setDireccion(e.target.value)} className="input" /></div>
          <div className="flex gap-2">
            <button onClick={() => setEditando(false)} className="btn-outline btn-sm flex-1">Cancelar</button>
            <button onClick={guardar} disabled={actualizar.isPending} className="btn-primary btn-sm flex-1">Guardar</button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <Dato label="Teléfono" value={c.telefono_principal} />
          <Dato label="Correo" value={c.correo} />
          <Dato label="Dirección" value={c.direccion} />
          <Dato label="Barrio" value={c.barrio} />
          <Dato label="Área" value={c.area} />
        </div>
      )}
    </div>
  );
}

function Dato({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-content-muted">{label}</div>
      <div className="text-sm text-content-strong">{value || '—'}</div>
    </div>
  );
}

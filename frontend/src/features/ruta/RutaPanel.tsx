import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api/client';
import { money } from '@/lib/format';
import { SkeletonTarjetas } from '@/components/ui/Skeleton';
import { EstadoVacio, IconosVacio } from '@/components/ui/EstadoVacio';
import { optimizarRuta } from './optimizarRuta';
import { ModalGestion } from '@/features/mora/ModalGestion';

/** Parada consolidada por crédito (una por solicitud, no por cuota). */
interface ParadaRuta {
  solicitud_id: number;
  cliente_id: number;
  numero_credito?: string | null;
  estado: string;
  cuotas_vencidas: number;
  cuota_desde: number;
  cuota_hasta: number;
  fecha_mas_antigua: string;
  valor_pendiente: number;
  dias_mora: number;
  cliente: string;
  telefono?: string | null;
  direccion?: string | null;
  barrio?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  cobrador?: string | null;
}

interface RespuestaRuta {
  data: ParadaRuta[];
  resumen: {
    cobros_hoy: { cantidad: number; total: number };
    en_mora: { cantidad: number; total: number };
  };
}

function useRutaDia() {
  return useQuery({
    queryKey: ['ruta-dia'],
    queryFn: async () => (await api.get<RespuestaRuta>('/ruta-dia')).data,
    refetchInterval: 120_000,
  });
}

/** Ubicación del gestor (GPS) una vez, sin bloquear la carga. */
function useUbicacionGestor() {
  const [pos, setPos] = useState<{ latitud: number; longitud: number } | null>(null);
  const [estado, setEstado] = useState<'idle' | 'ok' | 'denegado' | 'no-disponible'>('idle');

  useEffect(() => {
    if (!('geolocation' in navigator)) { setEstado('no-disponible'); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { setPos({ latitud: p.coords.latitude, longitud: p.coords.longitude }); setEstado('ok'); },
      () => setEstado('denegado'),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  }, []);

  return { pos, estado };
}

export function RutaPanel() {
  const { data, isLoading, isError } = useRutaDia();
  const { pos, estado: estadoGps } = useUbicacionGestor();
  const paradas = useMemo(() => data?.data ?? [], [data]);
  const [vista, setVista] = useState<'ruta' | 'prioridad'>('ruta');

  const { vencidas, deHoy } = useMemo(() => {
    const v = paradas.filter((p) => p.estado === 'VENCIDA');
    const h = paradas.filter((p) => p.estado !== 'VENCIDA');
    if (vista === 'prioridad') {
      // Orden por prioridad de mora (más días primero), sin optimización geográfica
      const porMora = (arr: ParadaRuta[]) => [...arr].sort((a, b) => b.dias_mora - a.dias_mora);
      return {
        vencidas: { orden: porMora(v), tramos: [] as { km: number; min: number }[], totalKm: 0 },
        deHoy: { orden: porMora(h), tramos: [] as { km: number; min: number }[], totalKm: 0 },
      };
    }
    const optV = optimizarRuta(v, pos);
    const optH = optimizarRuta(h, pos);
    return {
      vencidas: { orden: optV.orden as ParadaRuta[], tramos: optV.tramos, totalKm: optV.totalKm },
      deHoy: { orden: optH.orden as ParadaRuta[], tramos: optH.tramos, totalKm: optH.totalKm },
    };
  }, [paradas, pos, vista]);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="page-title">Ruta y cobranza del día</h2>
          <p className="mb-1 text-sm text-content-muted">
            Cobros y mora del día. Registra el pago o la gestión en cada parada.
          </p>
        </div>
        <div className="flex rounded-xl bg-surface-3 p-0.5">
          <button onClick={() => setVista('ruta')}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${vista === 'ruta' ? 'bg-surface text-brand-700 shadow-sm' : 'text-content-muted'}`}>
            Ruta óptima
          </button>
          <button onClick={() => setVista('prioridad')}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${vista === 'prioridad' ? 'bg-surface text-brand-700 shadow-sm' : 'text-content-muted'}`}>
            Por prioridad
          </button>
        </div>
      </div>
      {vista === 'ruta' && estadoGps === 'ok' && (
        <p className="mb-5 text-xs text-estado-activo">Ruta optimizada desde tu ubicación actual.</p>
      )}
      {vista === 'ruta' && (estadoGps === 'denegado' || estadoGps === 'no-disponible') && (
        <p className="mb-5 text-xs text-content-muted">
          Activa la ubicación para optimizar la ruta desde donde estás. Por ahora se ordena desde la primera parada.
        </p>
      )}
      {vista === 'ruta' && estadoGps === 'idle' && <p className="mb-5 text-xs text-content-muted">Obteniendo tu ubicación…</p>}
      {vista === 'prioridad' && <p className="mb-5 text-xs text-content-muted">Ordenado por días de mora, de mayor a menor.</p>}

      {isLoading ? (
        <SkeletonTarjetas cantidad={3} />
      ) : isError || !data ? (
        <p className="alert-error">No se pudo cargar la ruta del día.</p>
      ) : (
        <div className="space-y-6">
          {/* OBJETIVO DE LA JORNADA. Una sola cifra grande: lo que hay por cobrar
              hoy. La mora va aparte porque es una tarea distinta, no una suma. */}
          <div className="overflow-hidden rounded-3xl bg-krypta-600 text-white shadow-[0_8px_28px_rgb(24_28_48/0.18)]">
            <div className="px-5 pt-5 sm:px-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
                Por cobrar hoy
              </p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
                <span className="font-display text-dato-2xl font-bold tabular-nums tracking-tight">
                  {money(data.resumen.cobros_hoy.total)}
                </span>
                <span className="text-sm text-white/45">
                  {data.resumen.cobros_hoy.cantidad} crédito{data.resumen.cobros_hoy.cantidad === 1 ? '' : 's'}
                </span>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/[0.08] px-5 py-3.5 sm:px-6">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-estado-mora" aria-hidden />
                <span className="text-sm text-white/70">Mora por recuperar</span>
              </div>
              <div className="text-right">
                <div className="font-display text-dato font-bold tabular-nums">{money(data.resumen.en_mora.total)}</div>
                <div className="text-[11px] text-white/40">
                  {data.resumen.en_mora.cantidad} crédito{data.resumen.en_mora.cantidad === 1 ? '' : 's'}
                </div>
              </div>
            </div>
          </div>

          {vencidas.orden.length > 0 && (
            <Seccion titulo="Primero: en mora" tono="mora"
              paradas={vencidas.orden} tramos={vencidas.tramos} totalKm={vencidas.totalKm} />
          )}
          {deHoy.orden.length > 0 && (
            <Seccion titulo="Vencen hoy" tono="hoy"
              paradas={deHoy.orden} tramos={deHoy.tramos} totalKm={deHoy.totalKm} />
          )}
          {paradas.length === 0 && (
            <EstadoVacio icono={IconosVacio.aprobacion} titulo="Ruta al día"
              descripcion="No tienes cobros pendientes para hoy. ¡Buen trabajo!" />
          )}
        </div>
      )}
    </div>
  );
}

function Seccion({ titulo, paradas, tramos, totalKm, tono }: {
  titulo: string; paradas: ParadaRuta[]; tramos: { km: number; min: number }[]; totalKm: number; tono: 'mora' | 'hoy';
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className={`text-sm font-semibold ${tono === 'mora' ? 'text-estado-pendiente' : 'text-content'}`}>{titulo}</h3>
        {totalKm > 0 && (
          <span className="text-xs text-content-muted">{paradas.length} parada{paradas.length === 1 ? '' : 's'} · ~{totalKm} km</span>
        )}
      </div>
      <div className="space-y-3">
        {paradas.map((p, i) => <Parada key={p.solicitud_id} p={p} orden={i + 1} tramo={tramos[i]} />)}
      </div>
    </div>
  );
}

function Parada({ p, orden, tramo }: { p: ParadaRuta; orden: number; tramo?: { km: number; min: number } }) {
  const [gestionar, setGestionar] = useState(false);
  const gps = p.latitud != null && p.longitud != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${p.latitud},${p.longitud}`
    : null;
  const tel = (p.telefono ?? '').replace(/\D/g, '');
  const wa = tel ? `https://wa.me/${tel.length === 10 ? `57${tel}` : tel}` : null;

  return (
    <div className={`card card-pad flex flex-wrap items-center justify-between gap-3 border-l-4
      ${p.estado === 'VENCIDA' ? 'border-l-estado-mora' : 'border-l-estado-info'}`}>
      <div className="flex min-w-0 items-start gap-3">
        {/* El número de parada es la brújula del recorrido: se lee primero. */}
        <div className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl text-sm font-bold
          ${p.estado === 'VENCIDA' ? 'bg-estado-mora-bg text-estado-mora' : 'bg-estado-info-bg text-estado-info'}`}>
          {orden}
        </div>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-content-strong">{p.cliente}</div>
          <div className="text-xs text-content-muted">{p.numero_credito ?? `#${p.solicitud_id}`}</div>
          <div className="text-sm text-content-muted">
            {p.direccion ?? 'Sin dirección'}{p.barrio ? ` · ${p.barrio}` : ''}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-content-muted">
            <span>{p.cuotas_vencidas} cuota{p.cuotas_vencidas === 1 ? '' : 's'} vencida{p.cuotas_vencidas === 1 ? '' : 's'}</span>
            {p.estado === 'VENCIDA' && (
              <span className="rounded-full bg-estado-pendiente-bg px-2 py-0.5 text-estado-pendiente">{p.dias_mora} día{p.dias_mora === 1 ? '' : 's'} de mora</span>
            )}
            {tramo && tramo.km > 0 && (
              <span>· a {tramo.km < 1 ? `${Math.round(tramo.km * 1000)} m` : `${tramo.km.toFixed(1)} km`} (~{tramo.min} min)</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="text-right">
          <div className={`font-display text-dato-lg font-bold tabular-nums
            ${p.estado === 'VENCIDA' ? 'text-estado-mora' : 'text-content-strong'}`}>
            {money(p.valor_pendiente)}
          </div>
          <div className="text-[11px] text-content-muted">
            {p.estado === 'VENCIDA' ? 'en mora' : 'por cobrar'}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          {wa && <a href={wa} target="_blank" rel="noreferrer" className="btn-outline btn-sm">WhatsApp</a>}
          {gps && <a href={gps} target="_blank" rel="noreferrer" className="btn-outline btn-sm">Ir →</a>}
          <button onClick={() => setGestionar(true)} className="btn-primary btn-sm">Gestionar</button>
        </div>
      </div>
      {gestionar && (
        <ModalGestion clienteId={p.cliente_id} solicitudId={p.solicitud_id} nombre={p.cliente}
          saldo={p.valor_pendiente} onClose={() => setGestionar(false)} />
      )}
    </div>
  );
}

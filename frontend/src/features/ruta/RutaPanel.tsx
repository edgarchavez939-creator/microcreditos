import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api/client';
import { money } from '@/lib/format';
import { SkeletonTarjetas } from '@/components/ui/Skeleton';
import { EstadoVacio, IconosVacio } from '@/components/ui/EstadoVacio';
import { optimizarRuta } from './optimizarRuta';

/** Parada consolidada por crédito (una por solicitud, no por cuota). */
interface ParadaRuta {
  solicitud_id: number;
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

  const { vencidas, deHoy } = useMemo(() => {
    const v = paradas.filter((p) => p.estado === 'VENCIDA');
    const h = paradas.filter((p) => p.estado !== 'VENCIDA');
    const optV = optimizarRuta(v, pos);
    const optH = optimizarRuta(h, pos);
    return {
      vencidas: { orden: optV.orden as ParadaRuta[], tramos: optV.tramos, totalKm: optV.totalKm },
      deHoy: { orden: optH.orden as ParadaRuta[], tramos: optH.tramos, totalKm: optH.totalKm },
    };
  }, [paradas, pos]);

  return (
    <div>
      <h2 className="page-title">Ruta del día</h2>
      <p className="mb-1 text-sm text-slate-500">
        Los cobros de hoy y la mora pendiente, ordenados para recorrer menos distancia.
      </p>
      {estadoGps === 'ok' && (
        <p className="mb-5 text-xs text-money-700">Ruta optimizada desde tu ubicación actual.</p>
      )}
      {(estadoGps === 'denegado' || estadoGps === 'no-disponible') && (
        <p className="mb-5 text-xs text-slate-400">
          Activa la ubicación para optimizar la ruta desde donde estás. Por ahora se ordena desde la primera parada.
        </p>
      )}
      {estadoGps === 'idle' && <p className="mb-5 text-xs text-slate-400">Obteniendo tu ubicación…</p>}

      {isLoading ? (
        <SkeletonTarjetas cantidad={3} />
      ) : isError || !data ? (
        <p className="alert-error">No se pudo cargar la ruta del día.</p>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-brand-50 p-4 ring-1 ring-brand-100">
              <div className="text-xs font-medium uppercase tracking-wide text-brand-700/70">Cobros de hoy</div>
              <div className="mt-1 font-display text-2xl font-bold text-brand-700">{money(data.resumen.cobros_hoy.total)}</div>
              <div className="text-xs text-brand-700/70">{data.resumen.cobros_hoy.cantidad} crédito{data.resumen.cobros_hoy.cantidad === 1 ? '' : 's'}</div>
            </div>
            <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-100">
              <div className="text-xs font-medium uppercase tracking-wide text-amber-800/70">Mora por recuperar</div>
              <div className="mt-1 font-display text-2xl font-bold text-amber-800">{money(data.resumen.en_mora.total)}</div>
              <div className="text-xs text-amber-800/70">{data.resumen.en_mora.cantidad} crédito{data.resumen.en_mora.cantidad === 1 ? '' : 's'} en mora</div>
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
        <h3 className={`text-sm font-semibold ${tono === 'mora' ? 'text-amber-800' : 'text-slate-700'}`}>{titulo}</h3>
        {totalKm > 0 && (
          <span className="text-xs text-slate-400">{paradas.length} parada{paradas.length === 1 ? '' : 's'} · ~{totalKm} km</span>
        )}
      </div>
      <div className="space-y-3">
        {paradas.map((p, i) => <Parada key={p.solicitud_id} p={p} orden={i + 1} tramo={tramos[i]} />)}
      </div>
    </div>
  );
}

function Parada({ p, orden, tramo }: { p: ParadaRuta; orden: number; tramo?: { km: number; min: number } }) {
  const gps = p.latitud != null && p.longitud != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${p.latitud},${p.longitud}`
    : null;
  const tel = (p.telefono ?? '').replace(/\D/g, '');
  const wa = tel ? `https://wa.me/${tel.length === 10 ? `57${tel}` : tel}` : null;

  return (
    <div className="card card-pad flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-500 text-xs font-bold text-white">
          {orden}
        </div>
        <div className="min-w-0">
          <div className="font-semibold">
            {p.cliente} <span className="font-normal text-slate-400">· {p.numero_credito ?? `#${p.solicitud_id}`}</span>
          </div>
          <div className="text-sm text-slate-500">
            {p.direccion ?? 'Sin dirección'}{p.barrio ? ` · ${p.barrio}` : ''}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
            <span>{p.cuotas_vencidas} cuota{p.cuotas_vencidas === 1 ? '' : 's'} vencida{p.cuotas_vencidas === 1 ? '' : 's'}</span>
            {p.estado === 'VENCIDA' && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">{p.dias_mora} día{p.dias_mora === 1 ? '' : 's'} de mora</span>
            )}
            {tramo && tramo.km > 0 && (
              <span>· a {tramo.km < 1 ? `${Math.round(tramo.km * 1000)} m` : `${tramo.km.toFixed(1)} km`} (~{tramo.min} min)</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="text-right">
          <div className="font-display text-lg font-bold">{money(p.valor_pendiente)}</div>
          <div className="text-xs text-slate-400">en mora</div>
        </div>
        <div className="flex gap-1.5">
          {wa && <a href={wa} target="_blank" rel="noreferrer" className="btn-outline btn-sm">WhatsApp</a>}
          {gps && <a href={gps} target="_blank" rel="noreferrer" className="btn-primary btn-sm">Ir →</a>}
        </div>
      </div>
    </div>
  );
}

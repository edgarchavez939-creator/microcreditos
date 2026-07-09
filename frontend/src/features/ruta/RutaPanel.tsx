import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { money, fecha } from '@/lib/format';
import { SkeletonTarjetas } from '@/components/ui/Skeleton';

interface ParadaRuta {
  cuota_id: number;
  numero_cuota: number;
  fecha_vencimiento: string;
  estado: string;
  valor_pendiente: number;
  dias_mora: number;
  solicitud_id: number;
  numero_credito?: string | null;
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

export function RutaPanel() {
  const { data, isLoading, isError } = useRutaDia();
  const paradas = data?.data ?? [];
  const vencidas = paradas.filter((p) => p.estado === 'VENCIDA');
  const deHoy = paradas.filter((p) => p.estado !== 'VENCIDA');

  return (
    <div>
      <h2 className="mb-1 text-xl font-bold">Ruta del día</h2>
      <p className="mb-5 text-sm text-slate-500">
        Los cobros de hoy y la mora pendiente, listos para salir a la calle.
      </p>

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
              <div className="text-xs text-brand-700/70">{data.resumen.cobros_hoy.cantidad} cuota{data.resumen.cobros_hoy.cantidad === 1 ? '' : 's'}</div>
            </div>
            <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-100">
              <div className="text-xs font-medium uppercase tracking-wide text-amber-800/70">Mora por recuperar</div>
              <div className="mt-1 font-display text-2xl font-bold text-amber-800">{money(data.resumen.en_mora.total)}</div>
              <div className="text-xs text-amber-800/70">{data.resumen.en_mora.cantidad} cuota{data.resumen.en_mora.cantidad === 1 ? '' : 's'} vencida{data.resumen.en_mora.cantidad === 1 ? '' : 's'}</div>
            </div>
          </div>

          {vencidas.length > 0 && (
            <Seccion titulo="Primero: en mora" paradas={vencidas} tono="mora" />
          )}
          {deHoy.length > 0 && (
            <Seccion titulo="Vencen hoy" paradas={deHoy} tono="hoy" />
          )}
          {paradas.length === 0 && (
            <p className="card card-pad border-2 border-dashed border-slate-200 text-center text-sm text-slate-500 shadow-none ring-0">
              No tienes cobros pendientes para hoy. ✓
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Seccion({ titulo, paradas, tono }: { titulo: string; paradas: ParadaRuta[]; tono: 'mora' | 'hoy' }) {
  return (
    <div>
      <h3 className={`mb-2 text-sm font-semibold ${tono === 'mora' ? 'text-amber-800' : 'text-slate-700'}`}>{titulo}</h3>
      <div className="space-y-3">
        {paradas.map((p) => <Parada key={p.cuota_id} p={p} />)}
      </div>
    </div>
  );
}

function Parada({ p }: { p: ParadaRuta }) {
  const gps = p.latitud != null && p.longitud != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${p.latitud},${p.longitud}`
    : null;
  const tel = (p.telefono ?? '').replace(/\D/g, '');
  const wa = tel ? `https://wa.me/${tel.length === 10 ? `57${tel}` : tel}` : null;

  return (
    <div className="card card-pad flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="font-semibold">{p.cliente} <span className="font-normal text-slate-400">· {p.numero_credito ?? `#${p.solicitud_id}`}</span></div>
        <div className="text-sm text-slate-500">
          {p.direccion ?? 'Sin dirección'}{p.barrio ? ` · ${p.barrio}` : ''}
        </div>
        <div className="mt-0.5 text-xs text-slate-400">
          Cuota {p.numero_cuota} · vence {fecha(p.fecha_vencimiento)}
          {p.estado === 'VENCIDA' && <span className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">{p.dias_mora} día{p.dias_mora === 1 ? '' : 's'} de mora</span>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="text-right font-display text-lg font-bold">{money(p.valor_pendiente)}</div>
        <div className="flex gap-1.5">
          {wa && <a href={wa} target="_blank" rel="noreferrer" className="btn-outline btn-sm">WhatsApp</a>}
          {gps && <a href={gps} target="_blank" rel="noreferrer" className="btn-primary btn-sm">Ir →</a>}
        </div>
      </div>
    </div>
  );
}

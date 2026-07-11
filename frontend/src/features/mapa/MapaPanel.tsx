import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '@/lib/api/client';
import { money } from '@/lib/format';
import { useAreas } from '@/features/clientes/hooks';

interface ClienteMapa {
  id: number;
  nombre: string;
  telefono?: string | null;
  direccion?: string | null;
  barrio?: string | null;
  latitud: number;
  longitud: number;
  cobrador?: string | null;
  area?: string | null;
  saldo: number;
  vencido: number;
  creditos_activos: number;
}

type Filtro = 'TODOS' | 'MORA' | 'ACTIVOS' | 'SIN_CREDITO';

function useClientesMapa() {
  return useQuery({
    queryKey: ['mapa-clientes'],
    queryFn: async () => (await api.get<{ data: ClienteMapa[] }>('/mapa/clientes')).data.data,
  });
}

function colorDe(c: ClienteMapa): string {
  if (Number(c.vencido) > 0) return '#e11d48';           // en mora → rojo
  if (Number(c.creditos_activos) > 0) return '#16a34a';  // al día → verde
  return '#94a3b8';                                      // sin créditos activos → gris
}

function pasaFiltro(c: ClienteMapa, f: Filtro): boolean {
  if (f === 'MORA') return Number(c.vencido) > 0;
  if (f === 'ACTIVOS') return Number(c.creditos_activos) > 0 && Number(c.vencido) === 0;
  if (f === 'SIN_CREDITO') return Number(c.creditos_activos) === 0;
  return true;
}

const FILTROS: Array<{ v: Filtro; t: string }> = [
  { v: 'TODOS', t: 'Todos' },
  { v: 'MORA', t: 'En mora' },
  { v: 'ACTIVOS', t: 'Al día' },
  { v: 'SIN_CREDITO', t: 'Sin crédito' },
];

export function MapaPanel() {
  const { data: clientes, isLoading, isError } = useClientesMapa();
  const { data: areas } = useAreas();
  const [filtro, setFiltro] = useState<Filtro>('TODOS');
  const [areaSel, setAreaSel] = useState<string>('TODAS');

  const contenedor = useRef<HTMLDivElement | null>(null);
  const mapa = useRef<L.Map | null>(null);
  const capa = useRef<L.LayerGroup | null>(null);

  const visibles = useMemo(
    () => (clientes ?? [])
      .filter((c) => areaSel === 'TODAS' || c.area === areaSel)
      .filter((c) => pasaFiltro(c, filtro)),
    [clientes, filtro, areaSel],
  );

  // Crear el mapa una sola vez
  useEffect(() => {
    if (!contenedor.current || mapa.current) return;
    mapa.current = L.map(contenedor.current, { zoomControl: true })
      .setView([4.6, -74.1], 6); // Colombia
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(mapa.current);
    capa.current = L.layerGroup().addTo(mapa.current);

    return () => { mapa.current?.remove(); mapa.current = null; capa.current = null; };
  }, []);

  // Pintar marcadores cuando cambian los datos o el filtro
  useEffect(() => {
    const m = mapa.current;
    const grupo = capa.current;
    if (!m || !grupo) return;

    grupo.clearLayers();
    if (visibles.length === 0) return;

    const bounds: L.LatLngTuple[] = [];
    for (const c of visibles) {
      const pos: L.LatLngTuple = [c.latitud, c.longitud];
      bounds.push(pos);
      const marcador = L.circleMarker(pos, {
        radius: 9,
        color: '#ffffff',
        weight: 2,
        fillColor: colorDe(c),
        fillOpacity: 0.95,
      });
      const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${c.latitud},${c.longitud}`;
      marcador.bindPopup(`
        <div style="min-width:200px;font-size:13px;line-height:1.5">
          <b>${c.nombre}</b><br/>
          ${c.direccion ?? ''}${c.barrio ? ` · ${c.barrio}` : ''}<br/>
          ${c.telefono ? `Tel: ${c.telefono}<br/>` : ''}
          ${c.cobrador ? `Cobrador: ${c.cobrador}<br/>` : ''}
          ${c.area ? `Área: ${c.area}<br/>` : ''}
          Saldo: <b>${money(Number(c.saldo))}</b>
          ${Number(c.vencido) > 0 ? `<br/><span style="color:#e11d48">Vencido: <b>${money(Number(c.vencido))}</b></span>` : ''}
          <br/><a href="${gmaps}" target="_blank" rel="noreferrer" style="color:#4f46e5">Cómo llegar →</a>
        </div>
      `);
      marcador.addTo(grupo);
    }
    m.fitBounds(L.latLngBounds(bounds).pad(0.2), { maxZoom: 15 });
  }, [visibles]);

  const base = useMemo(
    () => (clientes ?? []).filter((c) => areaSel === 'TODAS' || c.area === areaSel),
    [clientes, areaSel],
  );
  const conteo = useMemo(() => ({
    mora: base.filter((c) => Number(c.vencido) > 0).length,
    aldia: base.filter((c) => Number(c.creditos_activos) > 0 && Number(c.vencido) === 0).length,
    sin: base.filter((c) => Number(c.creditos_activos) === 0).length,
  }), [base]);

  return (
    <div>
      <h2 className="page-title">Mapa territorial</h2>
      <p className="mb-4 text-sm text-slate-500">
        Ubicación de tus clientes con su estado de cartera. Toca un punto para ver el detalle y navegar.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="text-sm">
          <select value={areaSel} onChange={(e) => setAreaSel(e.target.value)} className="input py-1.5">
            <option value="TODAS">Todas las áreas</option>
            {areas?.map((a) => <option key={a.id} value={a.nombre}>{a.nombre}</option>)}
          </select>
        </label>
        <div className="flex rounded-xl bg-slate-100 p-1">
          {FILTROS.map((f) => (
            <button key={f.v} onClick={() => setFiltro(f.v)}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
                filtro === f.v ? 'bg-white text-ink shadow-card' : 'text-slate-500 hover:text-ink'
              }`}>
              {f.t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full" style={{ background: '#e11d48' }} /> En mora ({conteo.mora})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full" style={{ background: '#16a34a' }} /> Al día ({conteo.aldia})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full" style={{ background: '#94a3b8' }} /> Sin crédito ({conteo.sin})
          </span>
        </div>
      </div>

      {isLoading && <p className="mb-2 text-sm text-slate-500">Cargando clientes…</p>}
      {isError && <p className="mb-2 alert-error">No se pudieron cargar los clientes del mapa.</p>}
      {!isLoading && clientes && clientes.length === 0 && (
        <p className="mb-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800 ring-1 ring-amber-100">
          Ningún cliente tiene ubicación GPS registrada todavía. La ubicación se captura al crear o editar el cliente.
        </p>
      )}

      <div ref={contenedor} className="h-[70vh] w-full overflow-hidden rounded-2xl ring-1 ring-slate-200" />
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '@/lib/api/client';
import { money } from '@/lib/format';
import { useAreas } from '@/features/clientes/hooks';
import { useAuthStore } from '@/stores/auth';

interface CobradorVivo {
  empleado_id: number;
  nombre: string;
  rol: string;
  ultima: { latitud: number; longitud: number; hace_seg: number };
  recorrido: [number, number][];
}

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
  const capaVivo = useRef<L.LayerGroup | null>(null);

  // COBRADORES EN VIVO: última posición + recorrido del día (solo admin/supervisor).
  // Se refresca cada 60 segundos, alineado con la frecuencia de reporte.
  const rol = useAuthStore((s) => s.usuario?.rol);
  const puedeVerVivo = rol === 'ADMINISTRADOR' || rol === 'SUPERVISOR' || rol === 'ADMIN_FUNCIONAL';
  const { data: cobradoresVivo } = useQuery({
    queryKey: ['mapa-cobradores-vivo'],
    queryFn: async () => (await api.get<{ data: CobradorVivo[] }>('/mapa/cobradores-en-vivo')).data.data,
    enabled: puedeVerVivo,
    refetchInterval: 60000,
  });

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
    capaVivo.current = L.layerGroup().addTo(mapa.current);

    return () => { mapa.current?.remove(); mapa.current = null; capa.current = null; capaVivo.current = null; };
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

  // Pintar COBRADORES EN VIVO: marcador con inicial + recorrido del día (polyline)
  useEffect(() => {
    const grupo = capaVivo.current;
    if (!grupo) return;
    grupo.clearLayers();
    for (const c of cobradoresVivo ?? []) {
      // Recorrido del día
      if (c.recorrido.length > 1) {
        L.polyline(c.recorrido as L.LatLngTuple[], {
          color: '#4f46e5', weight: 3, opacity: 0.6, dashArray: '6 6',
        }).addTo(grupo);
      }
      // Última posición: marcador con la inicial del nombre
      const inicial = (c.nombre?.charAt(0) ?? '?').toUpperCase();
      const haceMin = Math.round(c.ultima.hace_seg / 60);
      const frescura = c.ultima.hace_seg < 180 ? '#16a34a' : c.ultima.hace_seg < 900 ? '#d97706' : '#94a3b8';
      const icono = L.divIcon({
        className: '',
        html: `<div style="width:30px;height:30px;border-radius:9999px;background:${frescura};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.35)">${inicial}</div>`,
        iconSize: [30, 30], iconAnchor: [15, 15],
      });
      const marcador = L.marker([c.ultima.latitud, c.ultima.longitud], { icon: icono, zIndexOffset: 1000 });
      marcador.bindPopup(`
        <div style="min-width:180px;font-size:13px;line-height:1.5">
          <b>${c.nombre}</b><br/>
          ${c.rol === 'SUPERVISOR' ? 'Supervisor' : 'Cobrador'}<br/>
          Última señal: hace ${haceMin < 1 ? 'menos de 1 min' : haceMin + ' min'}<br/>
          <span style="color:#64748b;font-size:12px">La ubicación se actualiza mientras tenga la app abierta.</span>
        </div>
      `);
      marcador.addTo(grupo);
    }
  }, [cobradoresVivo]);

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
      <p className="mb-2 text-sm text-content-muted">
        Ubicación de tus clientes con su estado de cartera. Toca un punto para ver el detalle y navegar.
      </p>
      {puedeVerVivo && (
        <p className="mb-4 flex flex-wrap items-center gap-3 text-xs text-content-muted">
          <span className="font-medium text-slate-600">Equipo en vivo:</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-green-600" /> activo (&lt;3 min)</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-600" /> hace 3–15 min</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-400" /> sin señal reciente</span>
          <span className="text-content-muted">· La línea punteada es el recorrido de hoy. Se actualiza mientras el cobrador tenga la app abierta.</span>
        </p>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="text-sm">
          <select value={areaSel} onChange={(e) => setAreaSel(e.target.value)} className="input py-1.5">
            <option value="TODAS">Todas las áreas</option>
            {areas?.map((a) => <option key={a.id} value={a.nombre}>{a.nombre}</option>)}
          </select>
        </label>
        <div className="flex rounded-xl bg-surface-3 p-1">
          {FILTROS.map((f) => (
            <button key={f.v} onClick={() => setFiltro(f.v)}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
                filtro === f.v ? 'bg-surface text-ink shadow-card' : 'text-content-muted hover:text-ink'
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

      {isLoading && <p className="mb-2 text-sm text-content-muted">Cargando clientes…</p>}
      {isError && <p className="mb-2 alert-error">No se pudieron cargar los clientes del mapa.</p>}
      {!isLoading && clientes && clientes.length === 0 && (
        <p className="mb-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800 ring-1 ring-amber-100">
          Ningún cliente tiene ubicación GPS registrada todavía. La ubicación se captura al crear o editar el cliente.
        </p>
      )}

      <div ref={contenedor} className="h-[70vh] w-full overflow-hidden rounded-2xl ring-1 ring-border-token" />
    </div>
  );
}

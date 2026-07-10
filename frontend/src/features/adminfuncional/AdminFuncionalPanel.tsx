import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api/client';
import { useToast } from '@/components/ui/Toast';


export function AdminFuncionalPanel() {
  const [tab, setTab] = useState<'licencia' | 'flags' | 'marca' | 'monitoreo' | 'herramientas'>('licencia');
  const tabs = [
    ['licencia', 'Licenciamiento'],
    ['flags', 'Funcionalidades'],
    ['marca', 'Marca'],
    ['monitoreo', 'Monitoreo'],
    ['herramientas', 'Herramientas'],
  ] as const;

  return (
    <div>
      <h2 className="mb-1 text-xl font-bold">Administración de la plataforma</h2>
      <p className="mb-4 text-sm text-slate-500">Centro técnico exclusivo del Administrador Funcional. Cada acción queda auditada.</p>

      <div className="mb-5 flex flex-wrap gap-1.5 border-b border-slate-200">
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`rounded-t-lg px-3 py-2 text-sm font-medium ${tab === k ? 'border-b-2 border-brand-500 text-brand-700' : 'text-slate-500 hover:text-slate-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'licencia' && <Licencia />}
      {tab === 'flags' && <Flags />}
      {tab === 'marca' && <Marca />}
      {tab === 'monitoreo' && <Monitoreo />}
      {tab === 'herramientas' && <Herramientas />}
    </div>
  );
}

function Licencia() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({
    queryKey: ['af-licencia'],
    queryFn: async () => (await api.get('/admin-funcional/licencia')).data.data,
  });
  const [form, setForm] = useState<Record<string, unknown> | null>(null);
  const lic = form ?? data?.licencia ?? null;
  const uso = data?.uso;

  const m = useMutation({
    mutationFn: async () => (await api.put('/admin-funcional/licencia', lic)).data,
    onSuccess: () => { toast.exito('Licencia actualizada ✓'); qc.invalidateQueries({ queryKey: ['af-licencia'] }); setForm(null); },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al guardar.'),
  });

  if (!lic) return <p className="text-sm text-slate-400">Cargando…</p>;
  const set = (k: string, v: unknown) => setForm({ ...lic, [k]: v });

  const campos: [string, string, string][] = [
    ['max_usuarios', 'Máximo de usuarios', 'total'],
    ['max_administradores', 'Máximo de administradores', 'administradores'],
    ['max_supervisores', 'Máximo de supervisores', 'supervisores'],
    ['max_cobradores', 'Máximo de cobradores', 'cobradores'],
  ];

  return (
    <div className="card card-pad max-w-2xl">
      <div className="grid gap-4 sm:grid-cols-2">
        {campos.map(([k, label, usoKey]) => (
          <div key={k}>
            <label className="label">{label}</label>
            <input type="number" value={Number(lic[k] ?? 0)} onChange={(e) => set(k, Number(e.target.value))} className="input" />
            {uso && <p className="mt-1 text-xs text-slate-400">En uso: {uso[usoKey]} de {Number(lic[k] ?? 0)}</p>}
          </div>
        ))}
        <div>
          <label className="label">Vence el (opcional)</label>
          <input type="date" value={(lic.vence_el as string) ?? ''} onChange={(e) => set('vence_el', e.target.value || null)} className="input" />
        </div>
        <div>
          <label className="label">Estado</label>
          <select value={lic.estado as string} onChange={(e) => set('estado', e.target.value)} className="input">
            <option value="ACTIVA">Activa</option>
            <option value="SUSPENDIDA">Suspendida</option>
            <option value="VENCIDA">Vencida</option>
          </select>
        </div>
      </div>
      <button onClick={() => m.mutate()} disabled={m.isPending || !form} className="btn-primary btn-sm mt-4">
        {m.isPending ? 'Guardando…' : 'Guardar licencia'}
      </button>
    </div>
  );
}

function Flags() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: flags } = useQuery({
    queryKey: ['af-flags'],
    queryFn: async () => (await api.get('/admin-funcional/flags')).data.data as Array<Record<string, unknown>>,
  });
  const guardar = useMutation({
    mutationFn: async (f: Record<string, unknown>) => (await api.put('/admin-funcional/flags', f)).data,
    onSuccess: () => { toast.exito('Funcionalidad actualizada ✓'); qc.invalidateQueries({ queryKey: ['af-flags'] }); },
    onError: () => toast.error('No se pudo actualizar.'),
  });

  if (!flags || flags.length === 0) {
    return <p className="text-sm text-slate-400">No hay funcionalidades registradas. Se irán agregando a medida que se declaren módulos controlables.</p>;
  }
  return (
    <div className="space-y-2">
      {flags.map((f) => (
        <div key={f.clave as string} className="card card-pad flex items-center justify-between">
          <div>
            <div className="font-medium text-slate-700">{f.etiqueta as string}</div>
            <div className="text-xs text-slate-400">{(f.descripcion as string) ?? f.clave as string}</div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!f.activo}
              onChange={(e) => guardar.mutate({ ...f, activo: e.target.checked })} />
            {f.activo ? 'Activa' : 'Oculta'}
          </label>
        </div>
      ))}
    </div>
  );
}

function Marca() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({
    queryKey: ['af-marca'],
    queryFn: async () => (await api.get('/admin-funcional/marca')).data.data,
  });
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const marca = form ?? data ?? null;
  const m = useMutation({
    mutationFn: async () => (await api.put('/admin-funcional/marca', marca)).data,
    onSuccess: () => { toast.exito('Marca actualizada ✓'); qc.invalidateQueries({ queryKey: ['af-marca'] }); setForm(null); },
    onError: () => toast.error('No se pudo actualizar.'),
  });
  if (!marca) return <p className="text-sm text-slate-400">Cargando…</p>;
  const set = (k: string, v: string) => setForm({ ...marca, [k]: v });
  return (
    <div className="card card-pad max-w-xl space-y-4">
      <div>
        <label className="label">Nombre de la plataforma</label>
        <input value={marca.nombre_plataforma ?? ''} onChange={(e) => set('nombre_plataforma', e.target.value)} className="input" />
      </div>
      <div>
        <label className="label">Color primario</label>
        <div className="flex items-center gap-2">
          <input type="color" value={marca.color_primario ?? '#4F46E5'} onChange={(e) => set('color_primario', e.target.value)} className="h-10 w-16 rounded" />
          <input value={marca.color_primario ?? ''} onChange={(e) => set('color_primario', e.target.value)} className="input flex-1" />
        </div>
      </div>
      <div>
        <label className="label">Información de contacto</label>
        <input value={marca.contacto ?? ''} onChange={(e) => set('contacto', e.target.value)} className="input" />
      </div>
      <button onClick={() => m.mutate()} disabled={m.isPending || !form} className="btn-primary btn-sm">
        {m.isPending ? 'Guardando…' : 'Guardar marca'}
      </button>
      <p className="text-xs text-slate-400">Nota: el logo y favicon como archivos requieren almacenamiento externo (R2); se habilitarán en una fase posterior.</p>
    </div>
  );
}

function Monitoreo() {
  const { data } = useQuery({
    queryKey: ['af-monitoreo'],
    queryFn: async () => (await api.get('/admin-funcional/monitoreo')).data.data,
    refetchInterval: 30_000,
  });
  if (!data) return <p className="text-sm text-slate-400">Consultando estado…</p>;
  const Item = ({ label, ok, detalle }: { label: string; ok: boolean; detalle?: string }) => (
    <div className="card card-pad flex items-center justify-between">
      <div>
        <div className="font-medium text-slate-700">{label}</div>
        {detalle && <div className="text-xs text-slate-400">{detalle}</div>}
      </div>
      <span className={`h-3 w-3 rounded-full ${ok ? 'bg-money-500' : 'bg-slate-300'}`} />
    </div>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Item label="Base de datos" ok={data.base_datos?.ok} detalle={data.base_datos?.latencia_ms != null ? `${data.base_datos.latencia_ms} ms` : undefined} />
      <Item label="Usuarios activos" ok detalle={`${data.usuarios?.total ?? 0} usuarios`} />
      <Item label="Licencia" ok={data.licencia?.estado === 'ACTIVA'} detalle={data.licencia?.estado} />
      <Item label="Versión" ok detalle={String(data.version)} />
      <Item label="WhatsApp" ok={!!data.whatsapp?.configurado} detalle={data.whatsapp?.configurado ? 'Configurado' : 'No configurado'} />
      <Item label="Google Maps" ok={!!data.google_maps?.configurado} detalle={data.google_maps?.configurado ? 'Configurado' : 'No configurado'} />
      <Item label="Respaldos" ok={!!data.respaldos?.configurado} detalle={data.respaldos?.configurado ? 'Configurado' : 'No configurado'} />
    </div>
  );
}

function Herramientas() {
  const toast = useToast();
  const limpiar = useMutation({
    mutationFn: async () => (await api.post('/admin-funcional/cache/limpiar', {})).data,
    onSuccess: () => toast.exito('Caché limpiada ✓'),
    onError: () => toast.error('No se pudo limpiar la caché.'),
  });
  return (
    <div className="card card-pad max-w-xl">
      <h3 className="mb-1 text-sm font-semibold text-slate-700">Herramientas técnicas</h3>
      <p className="mb-3 text-xs text-slate-400">Ejecuta procesos de mantenimiento solo cuando sea necesario.</p>
      <button onClick={() => limpiar.mutate()} disabled={limpiar.isPending} className="btn-outline btn-sm">
        {limpiar.isPending ? 'Limpiando…' : 'Limpiar caché del sistema'}
      </button>
    </div>
  );
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ProductosFinancieros } from './ProductosFinancieros';
import { useState } from 'react';
import { api } from '@/lib/api/client';
import { fechaHora } from '@/lib/format';
import { aplicarColorMarca, aplicarNombreMarca } from '@/lib/marca';
import { useToast } from '@/components/ui/Toast';


export function AdminFuncionalPanel() {
  const [tab, setTab] = useState<'licencia' | 'productos' | 'flags' | 'marca' | 'mantenimiento' | 'versiones' | 'auditoria' | 'parametros' | 'monitoreo' | 'herramientas'>('licencia');
  const tabs = [
    ['licencia', 'Licenciamiento'],
    ['productos', 'Productos financieros'],
    ['flags', 'Funcionalidades'],
    ['marca', 'Marca'],
    ['mantenimiento', 'Mantenimiento'],
    ['versiones', 'Versiones'],
    ['auditoria', 'Auditoría'],
    ['parametros', 'Parámetros'],
    ['monitoreo', 'Monitoreo'],
    ['herramientas', 'Herramientas'],
  ] as const;

  return (
    <div>
      <h2 className="page-title">Administración de la plataforma</h2>
      <p className="mb-4 text-sm text-content-muted">Centro técnico exclusivo del Administrador Funcional. Cada acción queda auditada.</p>

      <div className="mb-5 flex flex-wrap gap-1.5 border-b border-border-token">
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`rounded-t-lg px-3 py-2 text-sm font-medium ${tab === k ? 'border-b-2 border-brand-500 text-brand-700' : 'text-content-muted hover:text-content'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'licencia' && <Licencia />}
      {tab === 'productos' && <ProductosFinancieros />}
      {tab === 'flags' && <Flags />}
      {tab === 'marca' && <Marca />}
      {tab === 'mantenimiento' && <Mantenimiento />}
      {tab === 'versiones' && <Versiones />}
      {tab === 'auditoria' && <Auditoria />}
      {tab === 'parametros' && <Parametros />}
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

  if (!lic) return <p className="text-sm text-content-muted">Cargando…</p>;
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
            {uso && <p className="mt-1 text-xs text-content-muted">En uso: {uso[usoKey]} de {Number(lic[k] ?? 0)}</p>}
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
    return <p className="text-sm text-content-muted">No hay funcionalidades registradas. Se irán agregando a medida que se declaren módulos controlables.</p>;
  }
  return (
    <div className="space-y-2">
      {flags.map((f) => (
        <div key={f.clave as string} className="card card-pad flex items-center justify-between">
          <div>
            <div className="font-medium text-content">{f.etiqueta as string}</div>
            <div className="text-xs text-content-muted">{(f.descripcion as string) ?? f.clave as string}</div>
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
    onSuccess: () => {
      toast.exito('Marca actualizada ✓');
      // Aplicar de inmediato en la sesión actual (sin recargar)
      if (marca?.color_primario) aplicarColorMarca(marca.color_primario);
      if (marca?.nombre_plataforma) aplicarNombreMarca(marca.nombre_plataforma);
      qc.invalidateQueries({ queryKey: ['af-marca'] });
      setForm(null);
    },
    onError: () => toast.error('No se pudo actualizar.'),
  });
  if (!marca) return <p className="text-sm text-content-muted">Cargando…</p>;
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
      <p className="text-xs text-content-muted">Nota: el logo y favicon como archivos requieren almacenamiento externo (R2); se habilitarán en una fase posterior.</p>
    </div>
  );
}

function Monitoreo() {
  const { data } = useQuery({
    queryKey: ['af-monitoreo'],
    queryFn: async () => (await api.get('/admin-funcional/monitoreo')).data.data,
    refetchInterval: 30_000,
  });
  if (!data) return <p className="text-sm text-content-muted">Consultando estado…</p>;
  const Item = ({ label, ok, detalle }: { label: string; ok: boolean; detalle?: string }) => (
    <div className="card card-pad flex items-center justify-between">
      <div>
        <div className="font-medium text-content">{label}</div>
        {detalle && <div className="text-xs text-content-muted">{detalle}</div>}
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
      <h3 className="mb-1 text-sm font-semibold text-content">Herramientas técnicas</h3>
      <p className="mb-3 text-xs text-content-muted">Ejecuta procesos de mantenimiento solo cuando sea necesario.</p>
      <button onClick={() => limpiar.mutate()} disabled={limpiar.isPending} className="btn-outline btn-sm">
        {limpiar.isPending ? 'Limpiando…' : 'Limpiar caché del sistema'}
      </button>
    </div>
  );
}

function Mantenimiento() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({
    queryKey: ['af-mantenimiento'],
    queryFn: async () => (await api.get('/admin-funcional/mantenimiento')).data.data,
  });
  const [form, setForm] = useState<{ activo: boolean; mensaje: string } | null>(null);
  const est = form ?? (data ? { activo: !!data.activo, mensaje: data.mensaje ?? '' } : null);
  const m = useMutation({
    mutationFn: async () => (await api.put('/admin-funcional/mantenimiento', est)).data,
    onSuccess: (r) => { toast.exito((r as { message?: string })?.message ?? 'Actualizado ✓'); qc.invalidateQueries({ queryKey: ['af-mantenimiento'] }); setForm(null); },
    onError: () => toast.error('No se pudo actualizar.'),
  });
  if (!est) return <p className="text-sm text-content-muted">Cargando…</p>;
  return (
    <div className="card card-pad max-w-xl space-y-4">
      <div className={`rounded-xl px-3.5 py-2.5 text-sm ${est.activo ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-100' : 'bg-money-50 text-money-700 ring-1 ring-money-100'}`}>
        Estado actual: <b>{est.activo ? 'EN MANTENIMIENTO' : 'Operativo'}</b>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={est.activo} onChange={(e) => setForm({ ...est, activo: e.target.checked })} />
        Activar modo mantenimiento (bloquea el acceso a todos menos al Administrador Funcional)
      </label>
      <div>
        <label className="label">Mensaje para los usuarios</label>
        <textarea value={est.mensaje} onChange={(e) => setForm({ ...est, mensaje: e.target.value })} className="input" rows={2}
          placeholder="Estamos realizando mejoras. Volvemos pronto." />
      </div>
      <button onClick={() => m.mutate()} disabled={m.isPending || !form} className="btn-primary btn-sm">
        {m.isPending ? 'Guardando…' : 'Guardar'}
      </button>
    </div>
  );
}

function Versiones() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: versiones } = useQuery({
    queryKey: ['af-versiones'],
    queryFn: async () => (await api.get('/admin-funcional/versiones')).data.data as Array<Record<string, unknown>>,
  });
  const [form, setForm] = useState({ version: '', mejoras: '', estado: 'PRODUCCION' });
  const m = useMutation({
    mutationFn: async () => (await api.post('/admin-funcional/versiones', form)).data,
    onSuccess: () => { toast.exito('Versión registrada ✓'); qc.invalidateQueries({ queryKey: ['af-versiones'] }); setForm({ version: '', mejoras: '', estado: 'PRODUCCION' }); },
    onError: () => toast.error('No se pudo registrar.'),
  });
  return (
    <div className="space-y-4">
      <div className="card card-pad max-w-xl">
        <h3 className="mb-2 text-sm font-semibold text-content">Registrar versión</h3>
        <div className="grid grid-cols-2 gap-2">
          <input value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} className="input" placeholder="v58" />
          <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })} className="input">
            <option value="PRODUCCION">Producción</option>
            <option value="PRUEBAS">Pruebas</option>
            <option value="DEPRECADA">Deprecada</option>
          </select>
        </div>
        <textarea value={form.mejoras} onChange={(e) => setForm({ ...form, mejoras: e.target.value })} className="input mt-2" rows={2} placeholder="Mejoras de esta versión…" />
        <button onClick={() => m.mutate()} disabled={m.isPending || !form.version} className="btn-primary btn-sm mt-2">Registrar</button>
      </div>
      {versiones && versiones.length > 0 && (
        <div className="table-wrap">
          <table className="table-base">
            <thead><tr><th>Versión</th><th>Fecha</th><th>Estado</th><th>Mejoras</th></tr></thead>
            <tbody>
              {versiones.map((v) => (
                <tr key={v.id as number}>
                  <td className="font-medium">{v.version as string}</td>
                  <td>{v.fecha_liberacion as string}</td>
                  <td>{v.estado as string}</td>
                  <td className="text-content-muted">{(v.mejoras as string) ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Auditoria() {
  const [filtros, setFiltros] = useState<{ entidad?: string; desde?: string; hasta?: string }>({});
  const params = new URLSearchParams();
  if (filtros.entidad) params.set('entidad', filtros.entidad);
  if (filtros.desde) params.set('desde', filtros.desde);
  if (filtros.hasta) params.set('hasta', filtros.hasta);
  const { data } = useQuery({
    queryKey: ['af-auditoria', params.toString()],
    queryFn: async () => (await api.get(`/admin-funcional/auditoria?${params.toString()}`)).data.data as Array<Record<string, unknown>>,
  });
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div>
          <label className="label text-xs">Entidad</label>
          <select value={filtros.entidad ?? ''} onChange={(e) => setFiltros((f) => ({ ...f, entidad: e.target.value || undefined }))} className="input py-1 text-sm">
            <option value="">Todas</option>
            <option value="solicitud">Solicitud</option>
            <option value="caja">Caja</option>
            <option value="admin_funcional">Admin funcional</option>
            <option value="usuario">Usuario</option>
          </select>
        </div>
        <div><label className="label text-xs">Desde</label><input type="date" value={filtros.desde ?? ''} onChange={(e) => setFiltros((f) => ({ ...f, desde: e.target.value }))} className="input py-1 text-sm" /></div>
        <div><label className="label text-xs">Hasta</label><input type="date" value={filtros.hasta ?? ''} onChange={(e) => setFiltros((f) => ({ ...f, hasta: e.target.value }))} className="input py-1 text-sm" /></div>
      </div>
      {!data || data.length === 0 ? (
        <p className="py-4 text-center text-sm text-content-muted">Sin registros de auditoría para los filtros.</p>
      ) : (
        <div className="table-wrap">
          <table className="table-base">
            <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Entidad</th><th>IP</th></tr></thead>
            <tbody>
              {data.map((a) => (
                <tr key={a.id as number}>
                  <td>{fechaHora(a.created_at as string)}</td>
                  <td>{(a.usuario as string) ?? '—'} <span className="text-xs text-content-muted">{(a.rol as string) ?? ''}</span></td>
                  <td className="font-medium">{a.accion as string}</td>
                  <td>{a.entidad as string}{a.entidad_id ? ` #${a.entidad_id}` : ''}</td>
                  <td className="text-xs text-content-muted">{(a.ip as string) ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Parametros() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({
    queryKey: ['af-parametros'],
    queryFn: async () => (await api.get('/admin-funcional/parametros')).data.data as Array<Record<string, unknown>>,
  });
  const [editando, setEditando] = useState<string | null>(null);
  const [valor, setValor] = useState('');
  const m = useMutation({
    mutationFn: async (clave: string) => (await api.put('/admin-funcional/parametros', { clave, valor: parseVal(valor) })).data,
    onSuccess: () => { toast.exito('Parámetro actualizado ✓'); qc.invalidateQueries({ queryKey: ['af-parametros'] }); setEditando(null); },
    onError: () => toast.error('No se pudo actualizar.'),
  });
  const parseVal = (v: string): unknown => { const n = Number(v); return v !== '' && !isNaN(n) ? n : v; };
  if (!data) return <p className="text-sm text-content-muted">Cargando…</p>;
  return (
    <div className="table-wrap">
      <table className="table-base">
        <thead><tr><th>Clave</th><th>Valor</th><th>Descripción</th><th></th></tr></thead>
        <tbody>
          {data.map((p) => {
            const clave = p.clave as string;
            const enEd = editando === clave;
            return (
              <tr key={clave}>
                <td className="font-mono text-xs">{clave}</td>
                <td>{enEd ? <input value={valor} onChange={(e) => setValor(e.target.value)} className="input py-1 text-sm" /> : <span className="tabular-nums">{JSON.stringify(p.valor)}</span>}</td>
                <td className="text-content-muted">{(p.descripcion as string) ?? '—'}</td>
                <td>
                  {enEd
                    ? <button onClick={() => m.mutate(clave)} disabled={m.isPending} className="btn-primary btn-sm">Guardar</button>
                    : <button onClick={() => { setEditando(clave); setValor(String(p.valor)); }} className="text-brand text-sm">Editar</button>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

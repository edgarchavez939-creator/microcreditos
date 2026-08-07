import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ProductosFinancieros } from './ProductosFinancieros';
import { useState } from 'react';
import { api } from '@/lib/api/client';
import { fechaHora } from '@/lib/format';
import { aplicarIdentidad, cargarIdentidad } from '@/lib/marca';
import { Logo } from '@/components/ui/Logo';
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
      <div className="page-header">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="page-title">Administración de la plataforma</h2>
          <span className="rounded-full bg-estado-validacion-bg px-2.5 py-0.5 text-[11px] font-medium text-estado-validacion">
            Centro técnico
          </span>
        </div>
        <p className="page-subtitle">
          Configuración de la plataforma, sin acceso a operaciones financieras.
          Cada acción queda auditada.
        </p>
      </div>

      {/* Con diez secciones, el desplazamiento horizontal es preferible a
          apilarlas: mantiene todo a un toque en móvil. */}
      <div className="mb-5 -mx-4 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0
        [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max gap-1 rounded-xl bg-surface-3 p-1">
          {tabs.map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`shrink-0 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors duration-rapido
                ${tab === k ? 'bg-surface text-content-strong shadow-[0_1px_2px_rgb(15_23_42/0.06)]' : 'text-content-muted hover:text-content'}`}>
              {label}
            </button>
          ))}
        </div>
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
  const restaurar = useMutation({
    mutationFn: async () => (await api.post('/admin-funcional/marca/restaurar')).data,
    onSuccess: async () => {
      toast.exito('Identidad restaurada ✓');
      setForm(null);
      await cargarIdentidad();
      qc.invalidateQueries({ queryKey: ['af-marca'] });
    },
    onError: () => toast.error('No se pudo restaurar.'),
  });
  const m = useMutation({
    mutationFn: async () => {
      // Se envían únicamente los campos editables: 'logos', 'variantes_logo' y
      // 'tipografias' son catálogos que llegan del servidor y no deben viajar
      // de vuelta (harían crecer la petición sin necesidad).
      const CAMPOS = ['nombre_plataforma','descriptor','contacto','color_primario','color_secundario',
        'color_exito','color_advertencia','color_peligro','color_oscuro','color_fondo',
        'tipografia_titulos','tipografia_texto','radio'];
      const payload: Record<string, unknown> = {};
      for (const c of CAMPOS) if (marca?.[c] !== undefined) payload[c] = marca[c];
      return (await api.put('/admin-funcional/marca', payload)).data;
    },
    onSuccess: () => {
      toast.exito('Identidad actualizada ✓');
      // Aplicar de inmediato en la sesión actual (sin recargar)
      aplicarIdentidad(marca as never);
      qc.invalidateQueries({ queryKey: ['af-marca'] });
      setForm(null);
    },
    onError: () => toast.error('No se pudo actualizar.'),
  });
  if (!marca) return <p className="text-sm text-content-muted">Cargando…</p>;
  const set = (k: string, v: string) => setForm({ ...marca, [k]: v });

  const COLORES: [string, string, string][] = [
    ['color_primario',    'Primario',    'Sidebar, encabezado y botón principal'],
    ['color_secundario',  'Secundario',  'Acciones, enlaces, foco y estados activos'],
    ['color_exito',       'Éxito',       'Pagos, caja cuadrada, créditos al día'],
    ['color_advertencia', 'Advertencia', 'Pendientes y avisos'],
    ['color_peligro',     'Peligro',     'Mora, faltantes y errores'],
    ['color_fondo',       'Fondo',       'Fondo general de la aplicación'],
  ];

  return (
    <div className="max-w-3xl space-y-4">
      {/* Vista previa: el cambio se ve antes de guardar */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3" style={{ backgroundColor: marca.color_primario ?? '#1A2B5F' }}>
          <div className="flex items-center gap-2.5">
            <Logo size={30} fondo="oscuro" className="rounded-lg" />
            <div className="leading-tight">
              <div className="text-sm font-bold text-white" style={{ fontFamily: `'${marca.tipografia_titulos ?? 'Sora'}'` }}>
                {marca.nombre_plataforma || 'KRYPTA'}
              </div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-white/50">
                {marca.descriptor || 'Business Suite'}
              </div>
            </div>
          </div>
        </div>
        <div className="p-4" style={{ backgroundColor: marca.color_fondo ?? '#F8FAFC' }}>
          <div className="flex flex-wrap items-center gap-2">
            {COLORES.slice(1, 5).map(([k]) => (
              <span key={k} className="rounded-full px-2.5 py-1 text-xs font-medium"
                style={{ backgroundColor: `${marca[k] ?? '#888'}1f`, color: marca[k] ?? '#888' }}>
                Ejemplo
              </span>
            ))}
            <span className="rounded-xl px-3 py-1.5 text-xs font-medium text-white"
              style={{ backgroundColor: marca.color_primario ?? '#1A2B5F' }}>Botón</span>
          </div>
          <p className="mt-2 text-sm" style={{ fontFamily: `'${marca.tipografia_texto ?? 'Inter'}'` }}>
            Así se leerá el texto de la aplicación.
          </p>
        </div>
      </div>

      {/* Identidad */}
      <div className="card card-pad space-y-4">
        <h3 className="text-sm font-semibold text-content-strong">Identidad</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Nombre de la plataforma</label>
            <input value={marca.nombre_plataforma ?? ''} onChange={(e) => set('nombre_plataforma', e.target.value)} className="input" />
          </div>
          <div>
            <label className="label">Descriptor</label>
            <input value={marca.descriptor ?? ''} onChange={(e) => set('descriptor', e.target.value)}
              className="input" placeholder="Business Suite" />
          </div>
        </div>
        <div>
          <label className="label">Información de contacto</label>
          <input value={marca.contacto ?? ''} onChange={(e) => set('contacto', e.target.value)} className="input" />
        </div>
      </div>

      {/* Paleta */}
      <div className="card card-pad space-y-3">
        <h3 className="text-sm font-semibold text-content-strong">Paleta</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {COLORES.map(([clave, titulo, uso]) => (
            <div key={clave}>
              <label className="label">{titulo}</label>
              <div className="flex items-center gap-2">
                <input type="color" value={marca[clave] ?? '#1A2B5F'} onChange={(e) => set(clave, e.target.value)}
                  className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-border-token bg-surface" />
                <input value={marca[clave] ?? ''} onChange={(e) => set(clave, e.target.value)}
                  className="input flex-1 font-mono text-xs" placeholder="#000000" />
              </div>
              <p className="mt-1 text-xs text-content-muted">{uso}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tipografía y forma */}
      <div className="card card-pad space-y-3">
        <h3 className="text-sm font-semibold text-content-strong">Tipografía y forma</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">Títulos y cifras</label>
            <select value={marca.tipografia_titulos ?? 'Sora'} onChange={(e) => set('tipografia_titulos', e.target.value)} className="input">
              {(data?.tipografias ?? []).map((f: string) => <option key={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Texto</label>
            <select value={marca.tipografia_texto ?? 'Inter'} onChange={(e) => set('tipografia_texto', e.target.value)} className="input">
              {(data?.tipografias ?? []).map((f: string) => <option key={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Esquinas</label>
            <select value={marca.radio ?? 'redondeado'} onChange={(e) => set('radio', e.target.value)} className="input">
              <option value="recto">Rectas</option>
              <option value="suave">Suaves</option>
              <option value="redondeado">Redondeadas</option>
            </select>
          </div>
        </div>
      </div>

      {/* Logos */}
      <GestorLogos variantes={data?.variantes_logo ?? {}} cargados={data?.logos ?? {}} toast={toast} onCambio={() => qc.invalidateQueries({ queryKey: ['af-marca'] })} />

      <div className="flex flex-wrap gap-2">
        <button onClick={() => m.mutate()} disabled={m.isPending || !form} className="btn-primary btn-sm">
          {m.isPending ? 'Guardando…' : 'Guardar identidad'}
        </button>
        {form && <button onClick={() => setForm(null)} className="btn-secondary btn-sm">Descartar cambios</button>}
        <button onClick={() => restaurar.mutate()} disabled={restaurar.isPending}
          className="btn-ghost btn-sm text-content-muted">Restaurar identidad KRYPTA</button>
      </div>
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
      <div className={`rounded-xl px-3.5 py-2.5 text-sm ${est.activo ? 'bg-estado-pendiente-bg text-estado-pendiente ring-1 ring-estado-pendiente/20' : 'bg-money-50 text-money-700 ring-1 ring-money-100'}`}>
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

/**
 * GESTOR DE LOGOS.
 *
 * Cinco variantes, cada una con su uso. La vista previa se muestra sobre el
 * fondo real donde se usará —blanco, navy u oscuro— porque un logo que se ve
 * bien sobre blanco puede desaparecer sobre el sidebar.
 *
 * El archivo se lee en el navegador y viaja en base64: evita depender de un
 * almacenamiento externo y mantiene la identidad dentro de la misma copia de
 * seguridad que el resto de los datos.
 */
function GestorLogos({ variantes, cargados, toast, onCambio }: {
  variantes: Record<string, string>;
  cargados: Record<string, { mime: string; nombre_archivo?: string; updated_at?: string }>;
  toast: { exito: (m: string) => void; error: (m: string) => void };
  onCambio: () => void;
}) {
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [previos, setPrevios] = useState<Record<string, string>>({});

  // Fondo de la vista previa según el uso de cada variante
  const FONDOS: Record<string, string> = {
    ISOTIPO_COLOR: '#FFFFFF',
    ISOTIPO_OSCURO: '#1A2B5F',
    MONO_BLANCO: '#0F172A',
    MONO_NEGRO: '#FFFFFF',
    APP_ICON: '#F1F5F9',
  };

  /**
   * Reduce una imagen grande antes de subirla. Un icono de app suele venir a
   * 1024×1024 y pesar varios MB; a 512 px se ve idéntico en pantalla y la
   * petición deja de ser un problema. Los SVG no se tocan: ya son vectoriales.
   */
  const optimizar = (file: File): Promise<{ base64: string; mime: string }> =>
    new Promise((resolve, reject) => {
      if (file.type === 'image/svg+xml') {
        const r = new FileReader();
        r.onload = () => resolve({ base64: String(r.result).split(',')[1] ?? '', mime: file.type });
        r.onerror = () => reject(new Error('lectura'));
        r.readAsDataURL(file);
        return;
      }

      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX = 512;
        const escala = Math.min(1, MAX / Math.max(img.width, img.height));
        // Si ya es pequeña y liviana, se sube tal cual
        if (escala === 1 && file.size < 400_000) {
          const r = new FileReader();
          r.onload = () => resolve({ base64: String(r.result).split(',')[1] ?? '', mime: file.type });
          r.onerror = () => reject(new Error('lectura'));
          r.readAsDataURL(file);
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * escala);
        canvas.height = Math.round(img.height * escala);
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('canvas')); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        // PNG conserva la transparencia, imprescindible en un logo
        const dataUrl = canvas.toDataURL('image/png');
        resolve({ base64: dataUrl.split(',')[1] ?? '', mime: 'image/png' });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagen no válida')); };
      img.src = url;
    });

  const subir = async (variante: string, file: File) => {
    if (file.size > 8_000_000) { toast.error('El archivo supera 8 MB. Usa una versión más liviana.'); return; }
    setSubiendo(variante);
    try {
      const { base64, mime } = await optimizar(file);
      await api.post('/admin-funcional/marca/logo', {
        variante, mime, contenido_base64: base64, nombre_archivo: file.name,
      });
      setPrevios((p) => ({ ...p, [variante]: `data:${mime};base64,${base64}` }));
      toast.exito('Logo actualizado ✓');
      await cargarIdentidad();
      onCambio();
    } catch (e) {
      // Mostrar el motivo real: sin esto, cualquier fallo se veía igual y no
      // había forma de saber si era el tamaño, el formato o el permiso.
      const err = e as { response?: { status?: number; data?: { message?: string; errors?: Record<string, string[]> } } };
      const detalle = err?.response?.data?.errors
        ? Object.values(err.response.data.errors).flat()[0]
        : err?.response?.data?.message;
      toast.error(detalle ?? (err?.response?.status === 413
        ? 'La imagen es demasiado pesada para el servidor. Prueba con una más liviana.'
        : 'No se pudo subir el logo.'));
    } finally {
      setSubiendo(null);
    }
  };

  const eliminar = async (variante: string) => {
    try {
      await api.delete(`/admin-funcional/marca/logo/${variante}`);
      setPrevios((p) => { const n = { ...p }; delete n[variante]; return n; });
      toast.exito('Logo eliminado ✓');
      await cargarIdentidad();
      onCambio();
    } catch { toast.error('No se pudo eliminar.'); }
  };

  return (
    <div className="card card-pad space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-content-strong">Logos</h3>
        <p className="mt-0.5 text-xs text-content-muted">
          Formatos admitidos: PNG, SVG, WebP o JPG, hasta 1,2 MB. Cada variante se muestra
          sobre el fondo donde realmente se usará.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {Object.entries(variantes).map(([clave, uso]) => {
          const yaHay = !!cargados[clave] || !!previos[clave];
          const preview = previos[clave];
          return (
            <div key={clave} className="rounded-xl ring-1 ring-border-token">
              <div className="grid h-24 place-items-center rounded-t-xl"
                style={{ backgroundColor: FONDOS[clave] ?? '#FFFFFF' }}>
                {preview
                  ? <img src={preview} alt="" className="max-h-16 max-w-[70%] object-contain" />
                  : yaHay
                    ? <span className="text-xs" style={{ color: clave === 'MONO_BLANCO' || clave === 'ISOTIPO_OSCURO' ? '#ffffff90' : '#64748B' }}>Cargado ✓</span>
                    : <span className="text-xs" style={{ color: clave === 'MONO_BLANCO' || clave === 'ISOTIPO_OSCURO' ? '#ffffff60' : '#94A3B8' }}>Sin logo</span>}
              </div>
              <div className="p-3">
                <p className="text-xs font-medium text-content">{uso}</p>
                {cargados[clave]?.nombre_archivo && (
                  <p className="mt-0.5 truncate text-[11px] text-content-muted">{cargados[clave].nombre_archivo}</p>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <label className="cursor-pointer text-xs font-medium text-brand-700 hover:underline">
                    {subiendo === clave ? 'Subiendo…' : yaHay ? 'Reemplazar' : 'Subir'}
                    <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden"
                      onChange={(e) => e.target.files?.[0] && subir(clave, e.target.files[0])} />
                  </label>
                  {yaHay && (
                    <button onClick={() => eliminar(clave)} className="text-xs text-content-muted hover:text-estado-mora">
                      Quitar
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

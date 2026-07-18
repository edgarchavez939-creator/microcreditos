import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { money, fecha } from '@/lib/format';
import { useToast } from '@/components/ui/Toast';
import type { ProductoFinanciero } from '@/features/solicitudes/schema';

const FRECUENCIAS = ['DIARIO', 'SEMANAL', 'QUINCENAL', 'MENSUAL'];

/**
 * PRODUCTOS FINANCIEROS (Motor de Productos) — gestión del Admin Funcional.
 * Crear, editar (con versionamiento automático), activar/desactivar, duplicar
 * y consultar el historial de versiones. Los productos definen el comportamiento
 * del crédito por configuración, sin desarrollos adicionales.
 */
export function ProductosFinancieros() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: productos, isLoading } = useQuery({
    queryKey: ['productos-financieros'],
    queryFn: async () => (await api.get<{ data: ProductoFinanciero[] }>('/productos-financieros')).data.data,
  });
  const [editando, setEditando] = useState<ProductoFinanciero | 'nuevo' | null>(null);
  const [versionesDe, setVersionesDe] = useState<ProductoFinanciero | null>(null);

  const invalidar = () => qc.invalidateQueries({ queryKey: ['productos-financieros'] });

  const activar = useMutation({
    mutationFn: async ({ id, activo }: { id: number; activo: boolean }) =>
      (await api.post(`/productos-financieros/${id}/activar`, { activo })).data,
    onSuccess: (r) => { toast.exito(r.message); invalidar(); },
    onError: () => toast.error('No se pudo cambiar el estado.'),
  });

  const duplicar = useMutation({
    mutationFn: async ({ id }: { id: number }) => {
      const codigo = prompt('Código del nuevo producto (ej: EMPLEADO):');
      if (!codigo) throw new Error('cancelado');
      const nombre = prompt('Nombre del nuevo producto:');
      if (!nombre) throw new Error('cancelado');
      return (await api.post(`/productos-financieros/${id}/duplicar`, { codigo, nombre })).data;
    },
    onSuccess: (r) => { toast.exito(r.message); invalidar(); },
    onError: (e) => { if ((e as Error).message !== 'cancelado') toast.error('No se pudo duplicar.'); },
  });

  if (editando) {
    return <FormProducto producto={editando === 'nuevo' ? null : editando}
      onCerrar={() => { setEditando(null); invalidar(); }} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Los productos definen el comportamiento del crédito por configuración. Cada cambio genera una nueva versión;
          los créditos existentes conservan sus condiciones originales.
        </p>
        <button onClick={() => setEditando('nuevo')} className="btn-primary btn-sm shrink-0">Nuevo producto</button>
      </div>

      {isLoading ? <p className="text-sm text-slate-400">Cargando…</p> : (
        <div className="space-y-2">
          {(productos ?? []).map((p) => (
            <div key={p.id} className="card card-pad">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ background: p.color ?? '#4F46E5' }} />
                  <span className="font-semibold text-slate-800">{p.nombre}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{p.codigo}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">v{p.version_actual}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${p.activo ? 'bg-money-50 text-money-700' : 'bg-slate-100 text-slate-400'}`}>
                    {p.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => setVersionesDe(p)} className="btn-outline btn-sm">Versiones</button>
                  <button onClick={() => duplicar.mutate({ id: p.id })} className="btn-outline btn-sm">Duplicar</button>
                  <button onClick={() => activar.mutate({ id: p.id, activo: !p.activo })} className="btn-outline btn-sm">
                    {p.activo ? 'Desactivar' : 'Activar'}
                  </button>
                  <button onClick={() => setEditando(p)} className="btn-primary btn-sm">Editar</button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                {p.usa_tasa && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-brand-700">Tasa {Number(p.tasa_defecto) * 100}%</span>}
                {p.usa_seguro && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-brand-700">Seguro {Number(p.seguro_defecto) * 100}%</span>}
                {p.usa_valor_pactado && <span className="rounded-full bg-money-50 px-2 py-0.5 text-money-700">Valor pactado</span>}
                {p.aprobacion_automatica && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">Aprobación automática</span>}
                {p.requiere_administrador && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">Requiere administrador</span>}
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">
                  Capital {money(p.capital_minimo)}–{money(p.capital_maximo)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {versionesDe && <ModalVersiones producto={versionesDe} onClose={() => setVersionesDe(null)} />}
    </div>
  );
}

function ModalVersiones({ producto, onClose }: { producto: ProductoFinanciero; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ['producto-versiones', producto.id],
    queryFn: async () => (await api.get<{ data: Array<{ version: number; cambios: string; created_at: string; cambiado_por?: string }> }>(
      `/productos-financieros/${producto.id}/versiones`)).data.data,
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="animate-fade-in-scale max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-base font-bold text-slate-800">Historial de versiones · {producto.nombre}</h3>
        <div className="space-y-2">
          {(data ?? []).map((v) => (
            <div key={v.version} className="rounded-xl bg-slate-50 p-3 text-sm">
              <div className="flex justify-between">
                <span className="font-semibold text-slate-700">Versión {v.version}</span>
                <span className="text-xs text-slate-400">{fecha(v.created_at)}{v.cambiado_por ? ` · ${v.cambiado_por}` : ''}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{v.cambios}</p>
            </div>
          ))}
        </div>
        <button onClick={onClose} className="btn-outline btn-sm mt-4 w-full">Cerrar</button>
      </div>
    </div>
  );
}

function FormProducto({ producto, onCerrar }: { producto: ProductoFinanciero | null; onCerrar: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    codigo: producto?.codigo ?? '',
    nombre: producto?.nombre ?? '',
    descripcion: producto?.descripcion ?? '',
    color: producto?.color ?? '#4F46E5',
    orden: producto?.orden ?? 0,
    usa_tasa: producto?.usa_tasa ?? true,
    tasa_defecto: producto ? Number(producto.tasa_defecto) * 100 : 10,
    permite_modificar_tasa: producto?.permite_modificar_tasa ?? true,
    usa_seguro: producto?.usa_seguro ?? true,
    seguro_defecto: producto ? Number(producto.seguro_defecto) * 100 : 10,
    permite_modificar_seguro: producto?.permite_modificar_seguro ?? true,
    usa_valor_pactado: producto?.usa_valor_pactado ?? false,
    permite_renovacion: producto?.permite_renovacion ?? true,
    requiere_supervisor: producto?.requiere_supervisor ?? true,
    requiere_administrador: producto?.requiere_administrador ?? false,
    aprobacion_automatica: producto?.aprobacion_automatica ?? false,
    permite_desembolso_efectivo: producto?.permite_desembolso_efectivo ?? true,
    permite_desembolso_transferencia: producto?.permite_desembolso_transferencia ?? true,
    capital_minimo: producto ? Number(producto.capital_minimo) : 0,
    capital_maximo: producto ? Number(producto.capital_maximo) : 20000000,
    cuotas_minimo: producto?.cuotas_minimo ?? 1,
    cuotas_maximo: producto?.cuotas_maximo ?? 120,
    frecuencias: ((): string[] => {
      if (!producto) return [...FRECUENCIAS];
      const fr = producto.frecuencias_permitidas;
      return typeof fr === 'string' ? (JSON.parse(fr || '[]') as string[]) : fr;
    })(),
  });

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((prev) => ({ ...prev, [k]: v }));

  const guardar = useMutation({
    mutationFn: async () => {
      const payload = {
        codigo: f.codigo.toUpperCase(), nombre: f.nombre, descripcion: f.descripcion || undefined,
        color: f.color, orden: Number(f.orden),
        usa_tasa: f.usa_tasa, tasa_defecto: Number(f.tasa_defecto) / 100, permite_modificar_tasa: f.permite_modificar_tasa,
        usa_seguro: f.usa_seguro, seguro_defecto: Number(f.seguro_defecto) / 100, permite_modificar_seguro: f.permite_modificar_seguro,
        usa_valor_pactado: f.usa_valor_pactado,
        permite_renovacion: f.permite_renovacion,
        requiere_supervisor: f.requiere_supervisor, requiere_administrador: f.requiere_administrador,
        aprobacion_automatica: f.aprobacion_automatica,
        permite_desembolso_efectivo: f.permite_desembolso_efectivo,
        permite_desembolso_transferencia: f.permite_desembolso_transferencia,
        recauda_seguro: f.usa_seguro,
        capital_minimo: Number(f.capital_minimo), capital_maximo: Number(f.capital_maximo),
        cuotas_minimo: Number(f.cuotas_minimo), cuotas_maximo: Number(f.cuotas_maximo),
        frecuencias_permitidas: f.frecuencias,
      };
      return producto
        ? (await api.patch(`/productos-financieros/${producto.id}`, payload)).data
        : (await api.post('/productos-financieros', payload)).data;
    },
    onSuccess: (r) => { toast.exito(r.message); onCerrar(); },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo guardar.'),
  });

  const Chk = ({ k, label }: { k: keyof typeof f; label: string }) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={Boolean(f[k])} onChange={(e) => set(k, e.target.checked as never)} />
      {label}
    </label>
  );

  return (
    <div className="space-y-4">
      <button onClick={onCerrar} className="text-sm text-brand-600 hover:underline">← Volver a productos</button>
      <h3 className="text-base font-bold text-slate-800">{producto ? `Editar: ${producto.nombre} (se generará versión ${producto.version_actual + 1})` : 'Nuevo producto financiero'}</h3>

      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Información general</p>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Código</label>
          <input value={f.codigo} onChange={(e) => set('codigo', e.target.value)} className="input" disabled={!!producto} placeholder="AL_BATE" /></div>
        <div><label className="label">Nombre</label>
          <input value={f.nombre} onChange={(e) => set('nombre', e.target.value)} className="input" /></div>
        <div><label className="label">Color</label>
          <input type="color" value={f.color ?? '#4F46E5'} onChange={(e) => set('color', e.target.value)} className="input h-10" /></div>
        <div><label className="label">Orden</label>
          <input type="number" value={f.orden} onChange={(e) => set('orden', Number(e.target.value))} className="input" /></div>
      </div>
      <div><label className="label">Descripción</label>
        <textarea value={f.descripcion ?? ''} onChange={(e) => set('descripcion', e.target.value)} className="input" rows={2} /></div>

      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Condiciones financieras</p>
      <div className="grid grid-cols-2 gap-2">
        <Chk k="usa_tasa" label="Utiliza tasa de interés" />
        <Chk k="permite_modificar_tasa" label="Permite modificar la tasa" />
        <Chk k="usa_seguro" label="Utiliza seguro" />
        <Chk k="permite_modificar_seguro" label="Permite modificar el seguro" />
        <Chk k="usa_valor_pactado" label="Maneja valor pactado (ej. Al Bate)" />
        <Chk k="permite_renovacion" label="Permite renovación" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {f.usa_tasa && <div><label className="label">Tasa por defecto (%)</label>
          <input type="number" step="0.1" value={f.tasa_defecto} onChange={(e) => set('tasa_defecto', Number(e.target.value))} className="input" /></div>}
        {f.usa_seguro && <div><label className="label">Seguro por defecto (%)</label>
          <input type="number" step="0.1" value={f.seguro_defecto} onChange={(e) => set('seguro_defecto', Number(e.target.value))} className="input" /></div>}
      </div>

      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Límites</p>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Capital mínimo (pesos)</label>
          <input type="number" value={f.capital_minimo} onChange={(e) => set('capital_minimo', Number(e.target.value))} className="input" /></div>
        <div><label className="label">Capital máximo (pesos)</label>
          <input type="number" value={f.capital_maximo} onChange={(e) => set('capital_maximo', Number(e.target.value))} className="input" /></div>
        <div><label className="label">Cuotas mínimo</label>
          <input type="number" value={f.cuotas_minimo} onChange={(e) => set('cuotas_minimo', Number(e.target.value))} className="input" /></div>
        <div><label className="label">Cuotas máximo</label>
          <input type="number" value={f.cuotas_maximo} onChange={(e) => set('cuotas_maximo', Number(e.target.value))} className="input" /></div>
      </div>
      <div>
        <label className="label">Frecuencias permitidas</label>
        <div className="flex flex-wrap gap-3">
          {FRECUENCIAS.map((fr) => (
            <label key={fr} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={f.frecuencias.includes(fr)}
                onChange={(e) => set('frecuencias', e.target.checked ? [...f.frecuencias, fr] : f.frecuencias.filter((x) => x !== fr))} />
              {fr.charAt(0) + fr.slice(1).toLowerCase()}
            </label>
          ))}
        </div>
      </div>

      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Aprobaciones y caja</p>
      <div className="grid grid-cols-2 gap-2">
        <Chk k="requiere_supervisor" label="Requiere supervisor" />
        <Chk k="requiere_administrador" label="Requiere administrador" />
        <Chk k="aprobacion_automatica" label="Aprobación automática" />
        <Chk k="permite_desembolso_efectivo" label="Desembolso en efectivo" />
        <Chk k="permite_desembolso_transferencia" label="Desembolso por transferencia" />
      </div>

      <div className="flex gap-2">
        <button onClick={onCerrar} className="btn-outline btn-sm flex-1">Cancelar</button>
        <button onClick={() => guardar.mutate()} disabled={!f.codigo || !f.nombre || guardar.isPending || f.frecuencias.length === 0}
          className="btn-primary btn-sm flex-1">
          {guardar.isPending ? 'Guardando…' : producto ? 'Guardar (nueva versión)' : 'Crear producto'}
        </button>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { fecha } from '@/lib/format';
import { useToast } from '@/components/ui/Toast';

/**
 * EMPRESAS · panel del Administrador Funcional Global.
 *
 * Cada tarjeta es una empresa cliente de la plataforma. Desde aquí se da de alta,
 * se configura, se habilitan sus módulos y se suspende o reactiva el servicio.
 * Ninguna acción de esta pantalla accede a la cartera de nadie.
 */

interface Empresa {
  id: number; nombre: string; nit: string | null; estado: string;
  moneda: string; zona_horaria: string; ciudad: string | null;
  telefono: string | null; email: string | null; created_at: string;
  plan: string | null; estado_plan: string | null; fecha_vencimiento: string | null;
  max_usuarios: number | null;
  usuarios: number; clientes: number; creditos_activos: number; modulos_habilitados: number;
}

interface ModuloCatalogo {
  codigo: string; nombre: string; descripcion: string; categoria: string;
  version: string; estado: string; nucleo: boolean; habilitado: boolean;
}

const ESTADOS: Record<string, { txt: string; cls: string }> = {
  ACTIVA:     { txt: 'Activa',     cls: 'bg-estado-activo-bg text-estado-activo' },
  PRUEBA:     { txt: 'En prueba',  cls: 'bg-estado-info-bg text-estado-info' },
  SUSPENDIDA: { txt: 'Suspendida', cls: 'bg-estado-pendiente-bg text-estado-pendiente' },
  INACTIVA:   { txt: 'Inactiva',   cls: 'bg-estado-inactivo-bg text-estado-inactivo' },
};

export function EmpresasPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const [creando, setCreando] = useState(false);
  const [modulosDe, setModulosDe] = useState<Empresa | null>(null);

  const { data: empresas, isLoading } = useQuery({
    queryKey: ['plataforma-empresas'],
    queryFn: async () => (await api.get<{ data: Empresa[] }>('/plataforma/empresas')).data.data,
  });

  const invalidar = () => qc.invalidateQueries({ queryKey: ['plataforma-empresas'] });
  const errorDe = (e: unknown) =>
    (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo completar la operación.';

  const soporte = useMutation({
    mutationFn: async ({ id, motivo }: { id: number; motivo: string }) =>
      (await api.post(`/plataforma/empresas/${id}/soporte`, { motivo })).data,
    onSuccess: (r: { message?: string }) => {
      toast.exito(r.message ?? 'Modo soporte activo ✓');
      // Al entrar en soporte cambia el contexto de datos: se recarga todo.
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(errorDe(e)),
  });

  const cambiarEstado = useMutation({
    mutationFn: async ({ id, estado, motivo }: { id: number; estado: string; motivo?: string }) =>
      (await api.post(`/plataforma/empresas/${id}/estado`, { estado, motivo })).data,
    onSuccess: (r: { message?: string }) => { toast.exito(r.message ?? 'Estado actualizado ✓'); invalidar(); },
    onError: (e) => toast.error(errorDe(e)),
  });

  const totales = {
    activas: empresas?.filter((e) => e.estado === 'ACTIVA').length ?? 0,
    prueba: empresas?.filter((e) => e.estado === 'PRUEBA').length ?? 0,
    suspendidas: empresas?.filter((e) => e.estado === 'SUSPENDIDA').length ?? 0,
    usuarios: empresas?.reduce((a, e) => a + e.usuarios, 0) ?? 0,
    creditos: empresas?.reduce((a, e) => a + e.creditos_activos, 0) ?? 0,
  };

  if (modulosDe) {
    return <ModulosEmpresa empresa={modulosDe} onVolver={() => { setModulosDe(null); invalidar(); }} />;
  }

  return (
    <div>
      <div className="page-header flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="page-title">Empresas</h2>
          <p className="page-subtitle">Clientes de la plataforma KRYPTA. Alta, módulos, plan y estado del servicio.</p>
        </div>
        <button onClick={() => setCreando(true)} className="btn-primary btn-sm">+ Nueva empresa</button>
      </div>

      {/* Pulso de la plataforma */}
      <div className="mb-5 overflow-hidden rounded-3xl bg-krypta-600 px-5 py-5 text-white shadow-[0_8px_28px_rgb(15_23_42/0.18)] sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">Empresas en la plataforma</p>
        <p className="mt-1 font-display text-dato-2xl font-bold tabular-nums tracking-tight">{empresas?.length ?? 0}</p>
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/[0.08] pt-4 sm:grid-cols-4">
          {[
            ['Activas', totales.activas],
            ['En prueba', totales.prueba],
            ['Suspendidas', totales.suspendidas],
            ['Créditos administrados', totales.creditos],
          ].map(([t, v]) => (
            <div key={t as string}>
              <p className="font-display text-dato font-bold tabular-nums">{v as number}</p>
              <p className="text-[11px] text-white/45">{t as string}</p>
            </div>
          ))}
        </div>
      </div>

      {creando && <FormEmpresa onCerrar={() => setCreando(false)} onOk={() => { setCreando(false); invalidar(); }} />}

      {isLoading && <p className="text-sm text-content-muted">Cargando empresas…</p>}

      <div className="space-y-2">
        {empresas?.map((e) => {
          const est = ESTADOS[e.estado] ?? ESTADOS.INACTIVA;
          return (
            <div key={e.id} className={`card card-pad border-l-4 ${
              e.estado === 'ACTIVA' ? 'border-l-estado-activo'
              : e.estado === 'PRUEBA' ? 'border-l-estado-info'
              : e.estado === 'SUSPENDIDA' ? 'border-l-estado-pendiente'
              : 'border-l-estado-inactivo'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-semibold text-content-strong">{e.nombre}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${est.cls}`}>{est.txt}</span>
                    {e.plan && (
                      <span className="rounded-full bg-estado-inactivo-bg px-2 py-0.5 text-[11px] font-medium text-estado-inactivo">
                        {e.plan}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-content-muted">
                    {e.nit && <>NIT {e.nit} · </>}{e.ciudad ?? 'Sin ciudad'} · {e.moneda}
                    {' · '}alta {fecha(e.created_at)}
                    {e.fecha_vencimiento && <> · vence {fecha(e.fecha_vencimiento)}</>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <span className="text-content-muted">Usuarios <b className="tabular-nums text-content-strong">{e.usuarios}</b>
                      {e.max_usuarios && <span className="text-content-muted">/{e.max_usuarios}</span>}
                    </span>
                    <span className="text-content-muted">Clientes <b className="tabular-nums text-content-strong">{e.clientes}</b></span>
                    <span className="text-content-muted">Créditos activos <b className="tabular-nums text-content-strong">{e.creditos_activos}</b></span>
                    <span className="text-content-muted">Módulos <b className="tabular-nums text-content-strong">{e.modulos_habilitados}</b></span>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  <button onClick={() => setModulosDe(e)} className="btn-secondary btn-sm">Módulos</button>
                  {e.estado !== 'INACTIVA' && (
                    <button onClick={() => {
                        const motivo = window.prompt(
                          'Motivo del acceso (mínimo 10 caracteres). Quedará registrado y visible para el cliente:');
                        if (motivo && motivo.trim().length >= 10) soporte.mutate({ id: e.id, motivo: motivo.trim() });
                        else if (motivo !== null) toast.error('El motivo debe tener al menos 10 caracteres.');
                      }}
                      className="btn-ghost btn-sm text-estado-validacion">Soporte</button>
                  )}
                  {e.estado === 'SUSPENDIDA' ? (
                    <button onClick={() => cambiarEstado.mutate({ id: e.id, estado: 'ACTIVA' })}
                      className="btn-outline btn-sm">Reactivar</button>
                  ) : e.estado !== 'INACTIVA' && (
                    <button onClick={() => {
                        const motivo = window.prompt('Motivo de la suspensión (lo verá el equipo de soporte):');
                        if (motivo !== null) cambiarEstado.mutate({ id: e.id, estado: 'SUSPENDIDA', motivo });
                      }}
                      className="btn-ghost btn-sm text-estado-pendiente">Suspender</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {!isLoading && (empresas?.length ?? 0) === 0 && (
          <p className="py-10 text-center text-sm text-content-muted">Aún no hay empresas registradas.</p>
        )}
      </div>
    </div>
  );
}

/** Alta de empresa: solo lo imprescindible; el resto se completa después. */
function FormEmpresa({ onCerrar, onOk }: { onCerrar: () => void; onOk: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    nombre: '', nit: '', ciudad: '', email: '', telefono: '',
    moneda: 'COP', zona_horaria: 'America/Bogota',
  });
  const set = (k: string, v: string) => setF({ ...f, [k]: v });

  const m = useMutation({
    mutationFn: async () => (await api.post('/plataforma/empresas', f)).data,
    onSuccess: (r: { message?: string }) => { toast.exito(r.message ?? 'Empresa creada ✓'); onOk(); },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo crear.'),
  });

  return (
    <div className="card card-pad mb-4">
      <h3 className="mb-3 text-sm font-semibold text-content-strong">Nueva empresa</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label">Nombre *</label>
          <input value={f.nombre} onChange={(e) => set('nombre', e.target.value)} className="input" /></div>
        <div><label className="label">NIT</label>
          <input value={f.nit} onChange={(e) => set('nit', e.target.value)} className="input" /></div>
        <div><label className="label">Ciudad</label>
          <input value={f.ciudad} onChange={(e) => set('ciudad', e.target.value)} className="input" /></div>
        <div><label className="label">Correo de contacto</label>
          <input value={f.email} onChange={(e) => set('email', e.target.value)} className="input" inputMode="email" /></div>
        <div><label className="label">Teléfono</label>
          <input value={f.telefono} onChange={(e) => set('telefono', e.target.value)} className="input" /></div>
        <div><label className="label">Moneda</label>
          <select value={f.moneda} onChange={(e) => set('moneda', e.target.value)} className="input">
            {['COP', 'USD', 'MXN', 'PEN', 'CLP', 'ARS', 'EUR'].map((x) => <option key={x}>{x}</option>)}
          </select></div>
      </div>
      <p className="mt-3 text-xs text-content-muted">
        La empresa se crea en modo prueba por 30 días, con los módulos básicos habilitados.
      </p>
      <div className="mt-3 flex gap-2">
        <button onClick={() => m.mutate()} disabled={m.isPending || !f.nombre.trim()} className="btn-primary btn-sm">
          {m.isPending ? 'Creando…' : 'Crear empresa'}
        </button>
        <button onClick={onCerrar} className="btn-secondary btn-sm">Cancelar</button>
      </div>
    </div>
  );
}

/** Módulos contratados por una empresa, agrupados por categoría. */
function ModulosEmpresa({ empresa, onVolver }: { empresa: Empresa; onVolver: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();

  const { data } = useQuery({
    queryKey: ['empresa-modulos', empresa.id],
    queryFn: async () => (await api.get<{ data: { catalogo: ModuloCatalogo[] } }>(
      `/plataforma/empresas/${empresa.id}/modulos`)).data.data.catalogo,
  });

  const fijar = useMutation({
    mutationFn: async ({ codigo, habilitado }: { codigo: string; habilitado: boolean }) =>
      (await api.post(`/plataforma/empresas/${empresa.id}/modulos`, { modulo_codigo: codigo, habilitado })).data,
    onSuccess: (r: { message?: string }) => {
      toast.exito(r.message ?? 'Actualizado ✓');
      qc.invalidateQueries({ queryKey: ['empresa-modulos', empresa.id] });
    },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo actualizar.'),
  });

  const porCategoria = (data ?? []).reduce<Record<string, ModuloCatalogo[]>>((acc, m) => {
    (acc[m.categoria] ??= []).push(m);
    return acc;
  }, {});

  return (
    <div>
      <button onClick={onVolver} className="mb-3 text-sm text-brand-700 hover:underline">← Volver a empresas</button>

      <div className="page-header">
        <h2 className="page-title">Módulos · {empresa.nombre}</h2>
        <p className="page-subtitle">
          Un módulo deshabilitado desaparece del menú y deja de responder por API.
          Los módulos básicos no se pueden apagar.
        </p>
      </div>

      <div className="space-y-4">
        {Object.entries(porCategoria).map(([categoria, modulos]) => (
          <div key={categoria} className="card card-pad">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-content-muted">{categoria}</h3>
            <div className="space-y-1">
              {modulos.map((m) => (
                <div key={m.codigo} className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 hover:bg-surface-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-content-strong">{m.nombre}</span>
                      {m.nucleo && (
                        <span className="rounded-full bg-estado-inactivo-bg px-2 py-0.5 text-[10px] font-medium text-estado-inactivo">
                          básico
                        </span>
                      )}
                      {m.estado === 'BETA' && (
                        <span className="rounded-full bg-estado-validacion-bg px-2 py-0.5 text-[10px] font-medium text-estado-validacion">
                          beta
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-content-muted">{m.descripcion}</p>
                  </div>
                  <button
                    onClick={() => fijar.mutate({ codigo: m.codigo, habilitado: !m.habilitado })}
                    disabled={fijar.isPending || (m.nucleo && m.habilitado)}
                    aria-pressed={m.habilitado}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-rapido
                      disabled:cursor-not-allowed disabled:opacity-50
                      ${m.habilitado ? 'bg-estado-activo' : 'bg-surface-3 ring-1 ring-border-token'}`}>
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-rapido
                      ${m.habilitado ? 'translate-x-[1.375rem]' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

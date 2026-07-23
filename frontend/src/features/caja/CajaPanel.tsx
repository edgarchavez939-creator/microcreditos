import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { api } from '@/lib/api/client';
import { money, fecha, fechaHora } from '@/lib/format';
import { useToast } from '@/components/ui/Toast';
import { EscalaMoneda } from '@/components/ui/EscalaMoneda';
import { InputMoneda } from '@/components/ui/InputMoneda';
import { SkeletonIndicadores } from '@/components/ui/Skeleton';
import { useAuthStore } from '@/stores/auth';

interface EstadoCaja {
  fecha: string;
  base_inicial: number;
  cobros_efectivo: number;
  cobros_transferencia: number;
  total_cobros: number;
  numero_cobros: number;
  recaudo_seguros: number;
  numero_seguros: number;
  total_desembolsos: number;
  desembolsos_efectivo: number;
  total_gastos: number;
  gastos_efectivo: number;
  saldo_final: number;
  efectivo_esperado: number;
  movimiento_total: number;
  hora_apertura: string | null;
  tiene_base: boolean;
  esta_abierta: boolean;
  apertura: { estado: string; base_inicial: number; observacion_apertura: string | null; abierta_at: string } | null;
  ya_cerrada: boolean;
  cierre: Record<string, unknown> | null;
  movimientos: MovimientoCaja[];
  tipos_gasto: string[];
}

interface MovimientoCaja {
  id: number;
  tipo: string;
  concepto: string;
  subtipo?: string | null;
  valor: number;
  medio_pago: string;
  referencia_tipo?: string | null;
  observacion?: string | null;
  created_at: string;
}

const LABEL_GASTO: Record<string, string> = {
  ALIMENTACION: 'Alimentación', COMBUSTIBLE: 'Combustible', PARQUEADERO: 'Parqueadero',
  PEAJES: 'Peajes', VEHICULO: 'Gastos del vehículo', PAPELERIA: 'Papelería', OTROS: 'Otros',
};

export function CajaPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: e, isLoading } = useQuery({
    queryKey: ['caja-resumen'],
    queryFn: async () => (await api.get<{ data: EstadoCaja }>('/caja/resumen-dia')).data.data,
    refetchInterval: 60_000,
  });

  const invalidar = () => qc.invalidateQueries({ queryKey: ['caja-resumen'] });

  if (isLoading || !e) {
    return (
      <div>
        <h2 className="page-title">Caja del día</h2>
        <p className="mb-5 text-sm text-content-muted">Cargando el estado de tu caja…</p>
        <SkeletonIndicadores cantidad={6} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3"><h2 className="page-title">Caja del día</h2><EscalaMoneda /></div>
        <p className="text-sm text-content-muted">
          {e.ya_cerrada
            ? 'La caja de hoy ya está cerrada.'
            : e.esta_abierta
              ? 'Registra tus movimientos durante la jornada. El resumen se actualiza en tiempo real.'
              : 'Tu caja está cerrada. Ábrela para comenzar a operar.'}
        </p>
        {e.hora_apertura && (
          <p className="mt-0.5 text-xs text-content-muted">Apertura: {fechaHora(e.hora_apertura)}</p>
        )}
      </div>

      {/* RESUMEN EN TIEMPO REAL */}
      <ResumenCaja e={e} />

      {/* CAJA CERRADA (aún no abierta hoy): exigir apertura formal */}
      {!e.ya_cerrada && !e.esta_abierta && (
        <AbrirCaja onOk={invalidar} toast={toast} />
      )}

      {/* OPERACIÓN: solo con caja ABIERTA */}
      {!e.ya_cerrada && e.esta_abierta && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <RegistrarGasto tipos={e.tipos_gasto} onOk={invalidar} toast={toast} />
          </div>
        </>
      )}

      {/* LÍNEA DE TIEMPO DE MOVIMIENTOS */}
      <Movimientos movimientos={e.movimientos} cerrada={e.ya_cerrada} onOk={invalidar} toast={toast} />

      {/* CIERRE CON ARQUEO: solo con caja ABIERTA */}
      {!e.ya_cerrada && e.esta_abierta && <CierreArqueo e={e} onOk={invalidar} toast={toast} />}

      {/* HISTORIAL DE CIERRES */}
      <HistorialCierres />
    </div>
  );
}

interface CierreFila {
  id: number; fecha: string;
  base_inicial?: number; cobros_efectivo?: number; cobros_transferencia?: number;
  recaudo_seguros?: number; total_desembolsos?: number; total_gastos?: number;
  movimiento_total?: number; total_ingresos?: number; total_egresos?: number; saldo: number;
  efectivo_esperado?: number; efectivo_contado?: number | null; diferencia?: number;
  numero_pagos?: number; numero_desembolsos?: number; numero_gastos?: number; numero_seguros?: number;
  hora_apertura?: string | null; hora_cierre?: string | null; observacion?: string | null;
  rol_usuario?: string | null; cerrado_por?: string | null; abierto_por?: string | null;
  area?: string | null; created_at: string;
}

function HistorialCierres() {
  const rol = useAuthStore((st) => st.usuario?.rol);
  const esAdmin = rol === 'ADMINISTRADOR';
  const [abierto, setAbierto] = useState(false);
  const [filtros, setFiltros] = useState<{ desde?: string; hasta?: string; estado?: string; rol?: string }>({});
  const [expandido, setExpandido] = useState<number | null>(null);

  const params = new URLSearchParams();
  if (filtros.desde) params.set('desde', filtros.desde);
  if (filtros.hasta) params.set('hasta', filtros.hasta);
  if (esAdmin && filtros.estado) params.set('estado', filtros.estado);
  if (esAdmin && filtros.rol) params.set('rol', filtros.rol);

  const { data: cierres } = useQuery({
    queryKey: ['caja-cierres', params.toString()],
    queryFn: async () => (await api.get<{ data: CierreFila[] }>(`/caja/cierres?${params.toString()}`)).data.data,
  });

  const estadoCierre = (dif?: number) => {
    const d = dif ?? 0;
    if (Math.abs(d) < 0.01) return { txt: 'Cuadrada', cls: 'text-money-700 bg-money-50' };
    return d < 0
      ? { txt: 'Faltante', cls: 'text-rose-700 bg-rose-50' }
      : { txt: 'Sobrante', cls: 'text-amber-800 bg-amber-50' };
  };

  return (
    <div className="card card-pad">
      <button onClick={() => setAbierto((v) => !v)} className="flex w-full items-center justify-between text-sm font-semibold text-content">
        Historial de cierres{cierres ? ` (${cierres.length})` : ''}
        <span className="text-content-muted">{abierto ? '▲' : '▼'}</span>
      </button>

      {abierto && (
        <div className="mt-3">
          {/* Filtros */}
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <div>
              <label className="label text-xs">Desde</label>
              <input type="date" value={filtros.desde ?? ''} onChange={(e) => setFiltros((f) => ({ ...f, desde: e.target.value }))} className="input py-1 text-sm" />
            </div>
            <div>
              <label className="label text-xs">Hasta</label>
              <input type="date" value={filtros.hasta ?? ''} onChange={(e) => setFiltros((f) => ({ ...f, hasta: e.target.value }))} className="input py-1 text-sm" />
            </div>
            {esAdmin && (
              <>
                <div>
                  <label className="label text-xs">Estado</label>
                  <select value={filtros.estado ?? ''} onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value || undefined }))} className="input py-1 text-sm">
                    <option value="">Todos</option>
                    <option value="CUADRADA">Cuadrada</option>
                    <option value="FALTANTE">Faltante</option>
                    <option value="SOBRANTE">Sobrante</option>
                  </select>
                </div>
                <div>
                  <label className="label text-xs">Rol</label>
                  <select value={filtros.rol ?? ''} onChange={(e) => setFiltros((f) => ({ ...f, rol: e.target.value || undefined }))} className="input py-1 text-sm">
                    <option value="">Todos</option>
                    <option value="COBRADOR">Cobrador</option>
                    <option value="SUPERVISOR">Supervisor</option>
                    <option value="ADMINISTRADOR">Administrador</option>
                  </select>
                </div>
              </>
            )}
            {(filtros.desde || filtros.hasta || filtros.estado || filtros.rol) && (
              <button onClick={() => setFiltros({})} className="btn-outline btn-sm">Limpiar</button>
            )}
          </div>

          {!cierres || cierres.length === 0 ? (
            <p className="py-4 text-center text-sm text-content-muted">No hay cierres para los filtros seleccionados.</p>
          ) : (
            <div className="table-wrap">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Fecha</th>{esAdmin && <th>Usuario</th>}<th>Esperado</th><th>Contado</th><th>Diferencia</th><th>Estado</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {cierres.map((c) => {
                    const est = estadoCierre(c.diferencia);
                    const abiertoFila = expandido === c.id;
                    return (
                      <Fragment key={c.id}>
                        <tr onClick={() => setExpandido(abiertoFila ? null : c.id)} className="cursor-pointer">
                          <td>{fecha(c.fecha)}</td>
                          {esAdmin && <td>{c.cerrado_por ?? '—'}{c.rol_usuario ? <span className="ml-1 text-xs text-content-muted">({c.rol_usuario.toLowerCase()})</span> : ''}</td>}
                          <td>{money(c.efectivo_esperado ?? 0)}</td>
                          <td>{c.efectivo_contado != null ? money(c.efectivo_contado) : '—'}</td>
                          <td className={Math.abs(c.diferencia ?? 0) >= 0.01 ? ((c.diferencia ?? 0) < 0 ? 'text-rose-600' : 'text-amber-700') : 'text-content-muted'}>
                            {Math.abs(c.diferencia ?? 0) < 0.01 ? '—' : money(Math.abs(c.diferencia ?? 0))}
                          </td>
                          <td><span className={`rounded-full px-2 py-0.5 text-xs ${est.cls}`}>{est.txt}</span></td>
                          <td className="text-slate-300">{abiertoFila ? '▲' : '▼'}</td>
                        </tr>
                        {abiertoFila && (
                          <tr>
                            <td colSpan={esAdmin ? 7 : 6} className="bg-surface-2/60">
                              <DetalleCierre c={c} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetalleCierre({ c }: { c: CierreFila }) {
  const dato = (label: string, val: string) => (
    <div className="flex justify-between py-1 text-sm"><span className="text-content-muted">{label}</span><span className="font-medium tabular-nums">{val}</span></div>
  );
  const dur = c.hora_apertura && c.hora_cierre
    ? (() => {
        const ms = new Date(c.hora_cierre!).getTime() - new Date(c.hora_apertura!).getTime();
        const h = Math.floor(ms / 3_600_000); const m = Math.round((ms % 3_600_000) / 60_000);
        return `${h}h ${m}m`;
      })()
    : '—';
  return (
    <div className="grid gap-x-8 gap-y-1 px-2 py-3 sm:grid-cols-2 lg:grid-cols-3">
      <div>
        <div className="mb-1 text-xs font-semibold uppercase text-content-muted">Jornada</div>
        {dato('Apertura', c.hora_apertura ? fechaHora(c.hora_apertura) : '—')}
        {dato('Cierre', c.hora_cierre ? fechaHora(c.hora_cierre) : '—')}
        {dato('Duración', dur)}
        {dato('Abrió', c.abierto_por ?? '—')}
        {dato('Cerró', c.cerrado_por ?? '—')}
      </div>
      <div>
        <div className="mb-1 text-xs font-semibold uppercase text-content-muted">Ingresos</div>
        {dato('Base inicial', money(c.base_inicial ?? 0))}
        {dato('Cobros efectivo', money(c.cobros_efectivo ?? 0))}
        {dato('Cobros transferencia', money(c.cobros_transferencia ?? 0))}
        {dato('Recaudo seguros', money(c.recaudo_seguros ?? 0))}
      </div>
      <div>
        <div className="mb-1 text-xs font-semibold uppercase text-content-muted">Egresos y arqueo</div>
        {dato('Desembolsos', money(c.total_desembolsos ?? 0))}
        {dato('Gastos', money(c.total_gastos ?? 0))}
        {dato('Efectivo esperado', money(c.efectivo_esperado ?? 0))}
        {dato('Efectivo contado', c.efectivo_contado != null ? money(c.efectivo_contado) : '—')}
        {dato('Diferencia', money(c.diferencia ?? 0))}
      </div>
      <div className="sm:col-span-2 lg:col-span-3 mt-1 flex flex-wrap gap-x-6 gap-y-1 border-t border-border-token pt-2 text-xs text-content-muted">
        <span>{c.numero_pagos ?? 0} pago(s)</span>
        <span>{c.numero_desembolsos ?? 0} desembolso(s)</span>
        <span>{c.numero_gastos ?? 0} gasto(s)</span>
        <span>{c.numero_seguros ?? 0} seguro(s)</span>
        {c.observacion && <span className="text-content-muted">Obs: {c.observacion}</span>}
      </div>
    </div>
  );
}

function ResumenCaja({ e }: { e: EstadoCaja }) {
  const filas: [string, number, 'in' | 'out' | 'net'][] = [
    ['Base inicial', e.base_inicial, 'in'],
    ['Cobros en efectivo', e.cobros_efectivo, 'in'],
    ['Cobros por transferencia', e.cobros_transferencia, 'in'],
    ['Desembolsos', e.total_desembolsos, 'out'],
    ['Gastos', e.total_gastos, 'out'],
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="card card-pad lg:col-span-2">
        <h3 className="mb-3 text-sm font-semibold text-content">Movimientos del día</h3>
        <dl className="divide-y divide-border-token">
          {filas.map(([label, val, dir]) => (
            <div key={label} className="flex items-center justify-between py-2 text-sm">
              <dt className="text-slate-600">{label}{label === 'Cobros por transferencia' && e.numero_cobros > 0 ? '' : ''}</dt>
              <dd className={`font-semibold tabular-nums ${dir === 'out' ? 'text-rose-600' : 'text-content-strong'}`}>
                {dir === 'out' ? '− ' : '+ '}{money(val)}
              </dd>
            </div>
          ))}
          <div className="flex items-center justify-between py-2.5">
            <dt className="font-semibold">Saldo final del día</dt>
            <dd className="font-display text-lg font-bold tabular-nums text-brand-700">{money(e.saldo_final)}</dd>
          </div>
        </dl>
      </div>
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl bg-money-50 p-4 ring-1 ring-money-100">
          <div className="text-xs font-medium uppercase tracking-wide text-money-700/70">Efectivo esperado en caja</div>
          <div className="mt-1 font-display text-2xl font-bold text-money-700">{money(e.efectivo_esperado)}</div>
          <div className="mt-1 text-xs text-money-700/60">Solo dinero físico (excluye transferencias)</div>
        </div>
        <div className="rounded-2xl bg-surface-2 p-4 ring-1 ring-border-token">
          <div className="text-xs text-content-muted">Movimiento total del día</div>
          <div className="mt-1 font-display text-lg font-bold text-content">{money(e.movimiento_total)}</div>
          <div className="mt-1 text-xs text-content-muted">{e.numero_cobros} cobro(s) · {e.numero_seguros} seguro(s)</div>
        </div>
        {e.recaudo_seguros > 0 && (
          <div className="rounded-2xl bg-brand-50 p-4 ring-1 ring-brand-100">
            <div className="text-xs font-medium uppercase tracking-wide text-brand-700/70">Recaudo por seguros (comercial)</div>
            <div className="mt-1 font-display text-lg font-bold text-brand-700">{money(e.recaudo_seguros)}</div>
            <div className="mt-1 text-xs text-brand-700/60">Tu gestión comercial de solicitudes creadas. No es efectivo en caja.</div>
          </div>
        )}
      </div>
    </div>
  );
}

type ToastApi = ReturnType<typeof useToast>;

function AbrirCaja({ onOk, toast }: { onOk: () => void; toast: ToastApi }) {
  const [valor, setValor] = useState<number | null>(null);
  const [obs, setObs] = useState('');
  const m = useMutation({
    mutationFn: async () => (await api.post('/caja/abrir', { base_inicial: valor ?? 0, observacion: obs || undefined })).data,
    onSuccess: () => { toast.exito('Caja abierta ✓ Ya puedes operar'); setValor(null); setObs(''); onOk(); },
    onError: (err) => toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo abrir la caja.'),
  });
  return (
    <div className="card card-pad border-2 border-brand-200 bg-brand-50/40">
      <div className="mb-1 flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">1</span>
        <h3 className="text-base font-semibold text-content-strong">Abrir caja</h3>
      </div>
      <p className="mb-3 text-sm text-content-muted">
        Antes de cobrar, desembolsar o registrar gastos debes abrir tu caja. Ingresa el efectivo con el que inicias la jornada.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[140px]">
          <label className="label">Base inicial en efectivo</label>
          <InputMoneda valorPesos={valor} onChangePesos={setValor} />
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="label">Observación (opcional)</label>
          <input value={obs} onChange={(ev) => setObs(ev.target.value)} className="input" />
        </div>
        <button onClick={() => m.mutate()} disabled={m.isPending || valor === null} className="btn-primary btn-sm">
          {m.isPending ? 'Abriendo…' : 'ABRIR CAJA'}
        </button>
      </div>
    </div>
  );
}

function RegistrarGasto({ tipos, onOk, toast }: { tipos: string[]; onOk: () => void; toast: ToastApi }) {
  const [subtipo, setSubtipo] = useState(tipos[0] ?? 'OTROS');
  const [valor, setValor] = useState<number | null>(null);
  const [medio, setMedio] = useState('EFECTIVO');
  const [obs, setObs] = useState('');
  const m = useMutation({
    mutationFn: async () => (await api.post('/caja/gasto', {
      subtipo, valor: valor ?? 0, medio_pago: medio, observacion: obs || undefined,
    })).data,
    onSuccess: () => { toast.exito('Gasto registrado ✓'); setValor(null); setObs(''); onOk(); },
    onError: (err) => toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo registrar el gasto.'),
  });
  return (
    <div className="card card-pad">
      <h3 className="mb-2 text-sm font-semibold text-content">Registrar gasto</h3>
      <p className="mb-3 text-xs text-content-muted">Puedes registrar gastos en cualquier momento del día.</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Tipo</label>
          <select value={subtipo} onChange={(ev) => setSubtipo(ev.target.value)} className="input">
            {tipos.map((t) => <option key={t} value={t}>{LABEL_GASTO[t] ?? t}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Valor</label>
          <InputMoneda valorPesos={valor} onChangePesos={setValor} />
        </div>
        <div>
          <label className="label">Medio</label>
          <select value={medio} onChange={(ev) => setMedio(ev.target.value)} className="input">
            <option value="EFECTIVO">Efectivo</option>
            <option value="TRANSFERENCIA">Transferencia</option>
            <option value="NEQUI">Nequi</option>
            <option value="DAVIPLATA">Daviplata</option>
          </select>
        </div>
        <div>
          <label className="label">Observación</label>
          <input value={obs} onChange={(ev) => setObs(ev.target.value)} className="input" />
        </div>
      </div>
      <button onClick={() => m.mutate()} disabled={m.isPending || valor === null} className="btn-primary btn-sm mt-3">
        {m.isPending ? 'Guardando…' : 'Agregar gasto'}
      </button>
    </div>
  );
}

function Movimientos({ movimientos, cerrada, onOk, toast }: {
  movimientos: MovimientoCaja[]; cerrada: boolean; onOk: () => void; toast: ToastApi;
}) {
  const eliminar = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/caja/gasto/${id}`)).data,
    onSuccess: () => { toast.info('Gasto eliminado.'); onOk(); },
    onError: (err) => toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo eliminar.'),
  });
  if (movimientos.length === 0) return null;
  return (
    <div className="card card-pad">
      <h3 className="mb-3 text-sm font-semibold text-content">Movimientos de la jornada</h3>
      <ul className="space-y-1.5">
        {movimientos.map((m) => {
          const esEgreso = m.tipo === 'EGRESO';
          const esGasto = m.referencia_tipo === 'GASTO';
          return (
            <li key={m.id} className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm">
              <div className="min-w-0">
                <span className="font-medium text-content">{m.concepto}</span>
                <span className="ml-2 text-xs text-content-muted">
                  {fechaHora(m.created_at)} · {
                    m.medio_pago === 'EFECTIVO' ? 'Efectivo'
                    : m.medio_pago === 'TRANSFERENCIA' ? 'Transferencia'
                    : m.medio_pago.charAt(0) + m.medio_pago.slice(1).toLowerCase()
                  }
                  {m.observacion ? ` · ${m.observacion}` : ''}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`font-semibold tabular-nums ${esEgreso ? 'text-rose-600' : 'text-money-700'}`}>
                  {esEgreso ? '−' : '+'}{money(m.valor)}
                </span>
                {esGasto && !cerrada && (
                  <button onClick={() => eliminar.mutate(m.id)} className="text-xs text-slate-300 hover:text-rose-500">✕</button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CierreArqueo({ e, onOk, toast }: { e: EstadoCaja; onOk: () => void; toast: ToastApi }) {
  const [contado, setContado] = useState<number | null>(null);
  const [obs, setObs] = useState('');
  const [confirmar, setConfirmar] = useState(false);

  const diferencia = contado !== null ? contado - e.efectivo_esperado : 0;
  const hayDif = contado !== null && Math.abs(diferencia) >= 0.01;

  const m = useMutation({
    mutationFn: async () => (await api.post('/caja/cerrar', {
      efectivo_contado: contado ?? 0, observacion: obs || undefined,
    })).data,
    onSuccess: () => { toast.exito('Caja cerrada ✓'); onOk(); },
    onError: (err) => toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo cerrar la caja.'),
  });

  return (
    <div className="card card-pad border-t-4 border-brand-500">
      <h3 className="mb-1 text-sm font-semibold text-content">Cierre y arqueo de caja</h3>
      <p className="mb-3 text-xs text-content-muted">Cuenta el efectivo físico e ingrésalo. El sistema calculará la diferencia.</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-money-50 p-3 ring-1 ring-money-100">
          <div className="text-xs text-money-700/70">Efectivo esperado</div>
          <div className="font-display text-xl font-bold text-money-700">{money(e.efectivo_esperado)}</div>
        </div>
        <div>
          <label className="label">Efectivo contado (arqueo)</label>
          <InputMoneda valorPesos={contado} onChangePesos={setContado} />
        </div>
      </div>

      {hayDif && (
        <div className={`mt-3 rounded-xl px-3.5 py-2.5 text-sm ring-1 ${diferencia < 0 ? 'bg-rose-50 text-rose-700 ring-rose-100' : 'bg-amber-50 text-amber-800 ring-amber-100'}`}>
          {diferencia < 0 ? 'Faltante' : 'Sobrante'} de caja: <b>{money(Math.abs(diferencia))}</b>.
          Debes registrar una observación explicando la novedad.
        </div>
      )}

      {(hayDif || contado !== null) && (
        <div className="mt-3">
          <label className="label">Observación {hayDif && <span className="text-rose-500">*</span>}</label>
          <textarea value={obs} onChange={(ev) => setObs(ev.target.value)} className="input" rows={2}
            placeholder={hayDif ? 'Explica la diferencia (obligatorio)' : 'Observación del cierre (opcional)'} />
        </div>
      )}

      {!confirmar ? (
        <button onClick={() => setConfirmar(true)} disabled={contado === null || (hayDif && obs.trim().length < 3)}
          className="btn-primary btn-sm mt-4">
          Revisar y cerrar caja
        </button>
      ) : (
        <div className="mt-4 rounded-xl bg-surface-2 p-3 ring-1 ring-border-token">
          <p className="text-sm text-content">
            Vas a cerrar la caja con un efectivo contado de <b>{money(contado ?? 0)}</b>
            {hayDif && <> y una diferencia de <b>{money(Math.abs(diferencia))}</b> ({diferencia < 0 ? 'faltante' : 'sobrante'})</>}.
            Una vez cerrada, no podrás registrar más movimientos hoy.
          </p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => m.mutate()} disabled={m.isPending} className="btn-primary btn-sm">
              {m.isPending ? 'Cerrando…' : 'Confirmar cierre'}
            </button>
            <button onClick={() => setConfirmar(false)} className="btn-outline btn-sm">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { money } from '@/lib/format';
import { InputMoneda } from '@/components/ui/InputMoneda';
import { Tooltip } from '@/components/ui/Tooltip';

/**
 * CENTRO DE VALIDACIÓN DE MIGRACIONES (Fase 2).
 * Bandeja de créditos migrados con sus estados:
 *   🟡 PENDIENTE · 🔵 CORREGIDO · 🟢 VALIDADO · 🔒 BLOQUEADO (automático al primer movimiento)
 * Las acciones (validar / editar) las gobierna la matriz de permisos del backend:
 * si el usuario no tiene la acción, el servidor responde 403 y aquí se informa.
 */

interface Migrado {
  id: number; numero_credito: string; estado: string; estado_validacion: string | null;
  saldo_migrado: string | number; total_recaudar: string | number; numero_cuotas: number;
  modalidad: string; fecha_solicitud: string; created_at: string; migracion_id: number;
  cliente_id: number; nombres: string; apellidos: string; numero_documento: string;
  area: string | null; cobrador: string | null; producto: string | null;
  importador: string | null; nombre_archivo: string | null;
}
interface Indicadores {
  por_estado: Record<string, number>;
  errores_en_lotes: number;
  horas_promedio_validacion: number | null;
  top_validadores: { nombre: string; n: number }[];
}
interface Opciones {
  areas: { id: number; nombre: string }[];
  cobradores: { id: number; nombre: string }[];
  productos: { id: number; nombre: string }[];
  lotes: { id: number; nombre_archivo: string }[];
}

const ESTADOS: Record<string, { txt: string; emoji: string; cls: string }> = {
  PENDIENTE: { txt: 'Pendiente', emoji: '🟡', cls: 'bg-amber-50 text-amber-800' },
  CORREGIDO: { txt: 'Corregido', emoji: '🔵', cls: 'bg-brand-50 text-brand-700' },
  VALIDADO: { txt: 'Validado', emoji: '🟢', cls: 'bg-money-50 text-money-700' },
  BLOQUEADO: { txt: 'Bloqueado', emoji: '🔒', cls: 'bg-surface-3 text-content-muted' },
};

export function ValidacionPanel() {
  const qc = useQueryClient();
  const [filtroEstado, setFiltroEstado] = useState('');
  const [buscar, setBuscar] = useState('');
  const [areaF, setAreaF] = useState('');
  const [productoF, setProductoF] = useState('');
  const [loteF, setLoteF] = useState('');
  const [editando, setEditando] = useState<Migrado | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const params: Record<string, string> = {};
  if (filtroEstado) params.estado_validacion = filtroEstado;
  if (buscar.trim()) params.buscar = buscar.trim();
  if (areaF) params.area_id = areaF;
  if (productoF) params.producto_id = productoF;
  if (loteF) params.migracion_id = loteF;

  const { data, isLoading } = useQuery({
    queryKey: ['validacion-migrados', params],
    queryFn: async () => (await api.get<{ data: Migrado[]; conteos: Record<string, number> }>(
      '/validacion-migrados', { params })).data,
  });
  const { data: opciones } = useQuery({
    queryKey: ['validacion-opciones'],
    queryFn: async () => (await api.get<{ data: Opciones }>('/validacion-migrados/opciones')).data.data,
  });
  const { data: ind } = useQuery({
    queryKey: ['validacion-indicadores'],
    queryFn: async () => (await api.get<{ data: Indicadores }>('/validacion-migrados/indicadores')).data.data,
  });

  const invalidar = () => qc.invalidateQueries({ queryKey: ['validacion-migrados'] });
  const errorDe = (err: unknown) =>
    (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'La operación no se pudo completar.';

  const validar = useMutation({
    mutationFn: async (id: number) => (await api.post(`/validacion-migrados/${id}/validar`)).data,
    onSuccess: (r: { message?: string }) => { setMsg(r.message ?? 'Validado ✓'); setError(null); invalidar(); },
    onError: (err) => { setError(errorDe(err)); setMsg(null); },
  });

  const filas = data?.data ?? [];
  const conteos = data?.conteos ?? {};

  return (
    <div>
      {/* Fichas de estado */}
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        {(['PENDIENTE', 'CORREGIDO', 'VALIDADO', 'BLOQUEADO'] as const).map((e) => (
          <button key={e} onClick={() => setFiltroEstado(filtroEstado === e ? '' : e)}
            className={`rounded-xl p-3 text-center ring-1 transition ${filtroEstado === e ? 'ring-brand-400 bg-brand-50' : 'ring-border-token bg-surface'}`}>
            <div className="font-display text-xl font-bold">{conteos[e] ?? 0}</div>
            <div className="text-xs text-content-muted">
              {e === 'BLOQUEADO'
                ? <Tooltip texto="Se bloquea automáticamente al primer movimiento financiero (pago, renovación). Sus datos dejan de ser editables."><span>{ESTADOS[e].emoji} {ESTADOS[e].txt}</span></Tooltip>
                : <>{ESTADOS[e].emoji} {ESTADOS[e].txt}</>}
            </div>
          </button>
        ))}
      </div>

      {/* Indicadores del proceso (Fase 3) */}
      {ind && (
        <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 rounded-xl bg-surface-2 px-4 py-2.5 text-xs text-content-muted">
          <span>Errores encontrados en lotes: <b className="text-content">{ind.errores_en_lotes}</b></span>
          <span>Tiempo promedio de validación: <b className="text-content">
            {ind.horas_promedio_validacion === null ? '—' : ind.horas_promedio_validacion < 48 ? `${ind.horas_promedio_validacion} h` : `${(ind.horas_promedio_validacion / 24).toFixed(1)} días`}
          </b></span>
          {ind.top_validadores.length > 0 && (
            <span>Mayor validador: <b className="text-content">{ind.top_validadores[0].nombre}</b> ({ind.top_validadores[0].n})</span>
          )}
        </div>
      )}

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input value={buscar} onChange={(e) => setBuscar(e.target.value)}
          className="input w-56 py-1.5 text-sm" placeholder="Buscar: nombre, documento, MIG-…" />
        <select value={areaF} onChange={(e) => setAreaF(e.target.value)} className="input w-auto py-1.5 text-sm">
          <option value="">Todas las áreas</option>
          {opciones?.areas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <select value={productoF} onChange={(e) => setProductoF(e.target.value)} className="input w-auto py-1.5 text-sm">
          <option value="">Todos los productos</option>
          {opciones?.productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <select value={loteF} onChange={(e) => setLoteF(e.target.value)} className="input w-auto py-1.5 text-sm">
          <option value="">Todos los lotes</option>
          {opciones?.lotes.map((l) => <option key={l.id} value={l.id}>#{l.id} · {l.nombre_archivo}</option>)}
        </select>
      </div>

      {error && <p className="alert-error mb-3">{error}</p>}
      {msg && <p className="mb-3 text-sm text-money-700">{msg}</p>}
      {isLoading && <p className="text-sm text-content-muted">Cargando…</p>}

      {/* Bandeja */}
      <div className="space-y-2">
        {filas.map((f) => {
          const est = ESTADOS[f.estado_validacion ?? 'PENDIENTE'] ?? ESTADOS.PENDIENTE;
          return (
            <div key={f.id} className="card card-pad">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{f.nombres} {f.apellidos}</span>
                    <span className="text-xs text-content-muted">{f.numero_documento}</span>
                    <span className="text-xs font-medium text-brand-700">{f.numero_credito}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${est.cls}`}>{est.emoji} {est.txt}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-content-muted">
                    Saldo <b className="tabular-nums">{money(Number(f.total_recaudar))}</b>
                    {' · '}{f.numero_cuotas} cuota(s) {f.modalidad.toLowerCase()}
                    {' · '}{f.producto ?? 'sin producto'} · {f.area ?? 'sin área'} · {f.cobrador ?? 'sin cobrador'}
                    {' · '}lote #{f.migracion_id}{f.importador ? ` (${f.importador})` : ''}
                  </div>
                </div>
                <div className="flex gap-2">
                  {f.estado_validacion !== 'BLOQUEADO' && f.estado_validacion !== 'VALIDADO' && (
                    <button onClick={() => validar.mutate(f.id)} disabled={validar.isPending}
                      className="btn-primary btn-sm">Validar</button>
                  )}
                  {f.estado_validacion !== 'BLOQUEADO' && (
                    <button onClick={() => { setEditando(f); setMsg(null); setError(null); }}
                      className="btn-secondary btn-sm">Corregir</button>
                  )}
                </div>
              </div>

              {editando?.id === f.id && (
                <EditarMigrado credito={f} opciones={opciones}
                  onCerrar={() => setEditando(null)}
                  onOk={(m) => { setEditando(null); setMsg(m); invalidar(); }}
                  onError={(m) => setError(m)} />
              )}
            </div>
          );
        })}
        {!isLoading && filas.length === 0 && (
          <p className="py-8 text-center text-sm text-content-muted">No hay créditos migrados con estos filtros.</p>
        )}
      </div>
    </div>
  );
}

/** Edición controlada: solo campos autorizados + motivo obligatorio. */
function EditarMigrado({ credito, opciones, onCerrar, onOk, onError }: {
  credito: Migrado; opciones?: Opciones;
  onCerrar: () => void; onOk: (msg: string) => void; onError: (msg: string) => void;
}) {
  const [saldo, setSaldo] = useState<number | null>(Number(credito.total_recaudar));
  const [cuotas, setCuotas] = useState(String(credito.numero_cuotas));
  const [modalidad, setModalidad] = useState(credito.modalidad);
  const [productoId, setProductoId] = useState('');
  const [areaId, setAreaId] = useState('');
  const [cobradorId, setCobradorId] = useState('');
  const [fechaDes, setFechaDes] = useState(credito.fecha_solicitud?.slice(0, 10) ?? '');
  const [motivo, setMotivo] = useState('');

  const m = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { motivo };
      if (saldo !== null && saldo !== Number(credito.total_recaudar)) body.saldo_pendiente = saldo;
      if (Number(cuotas) !== credito.numero_cuotas) body.numero_cuotas = Number(cuotas);
      if (modalidad !== credito.modalidad) body.modalidad = modalidad;
      if (productoId) body.producto_financiero_id = Number(productoId);
      if (areaId) body.area_id = Number(areaId);
      if (cobradorId) body.cobrador_id = Number(cobradorId);
      if (fechaDes && fechaDes !== credito.fecha_solicitud?.slice(0, 10)) body.fecha_desembolso = fechaDes;
      return (await api.patch(`/validacion-migrados/${credito.id}`, body)).data;
    },
    onSuccess: (r: { message?: string }) => onOk(r.message ?? 'Corregido ✓'),
    onError: (err) => onError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo corregir.'),
  });

  return (
    <div className="mt-3 rounded-xl bg-surface-2 p-3 ring-1 ring-border-token">
      <p className="mb-2 text-xs text-content-muted">
        Corrige los datos importados. Si cambias el saldo, las cuotas o la modalidad, el plan de pagos
        se regenera desde hoy. Todo cambio queda auditado con su motivo.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">
            Saldo pendiente{saldo !== null && <span className="ml-1.5 font-normal text-content-muted">= ${saldo.toLocaleString('es-CO')}</span>}
          </label>
          <InputMoneda valorPesos={saldo} onChangePesos={setSaldo} mostrarEquivalencia={false} />
        </div>
        <div>
          <label className="label">N° de cuotas</label>
          <input type="number" min={1} max={120} value={cuotas} onChange={(e) => setCuotas(e.target.value)} className="input" />
        </div>
        <div>
          <label className="label">Modalidad</label>
          <select value={modalidad} onChange={(e) => setModalidad(e.target.value)} className="input">
            {['DIARIO', 'SEMANAL', 'QUINCENAL', 'MENSUAL'].map((x) => <option key={x}>{x}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Producto (opcional)</label>
          <select value={productoId} onChange={(e) => setProductoId(e.target.value)} className="input">
            <option value="">— Sin cambio —</option>
            {opciones?.productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Área (opcional)</label>
          <select value={areaId} onChange={(e) => setAreaId(e.target.value)} className="input">
            <option value="">— Sin cambio —</option>
            {opciones?.areas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Cobrador (opcional)</label>
          <select value={cobradorId} onChange={(e) => setCobradorId(e.target.value)} className="input">
            <option value="">— Sin cambio —</option>
            {opciones?.cobradores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Fecha de desembolso</label>
          <input type="date" value={fechaDes} onChange={(e) => setFechaDes(e.target.value)} className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Motivo del cambio (obligatorio)</label>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className="input"
            placeholder="Ej: saldo confirmado con el extracto de la plataforma anterior" />
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button onClick={() => m.mutate()} disabled={m.isPending || motivo.trim().length < 5} className="btn-primary btn-sm">
          {m.isPending && <span className="spinner" />}{m.isPending ? 'Guardando…' : 'Guardar corrección'}
        </button>
        <button onClick={onCerrar} className="btn-secondary btn-sm">Cancelar</button>
      </div>
    </div>
  );
}

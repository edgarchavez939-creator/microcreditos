import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import * as XLSX from 'xlsx';
import { api } from '@/lib/api/client';
import { money, fecha, fechaHora } from '@/lib/format';
import { useToast } from '@/components/ui/Toast';
import { useUsuarios } from '@/features/usuarios/hooks';

interface Consolidado {
  empleado_id: number; nombre: string; rol: string;
  saldo_pendiente: number; saldo_descuadres: number; saldo_prestamos: number;
  obligaciones_activas: number;
}

export function EstadoCuentaPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['estado-cuenta-consolidado'],
    queryFn: async () => (await api.get('/empleados/estado-cuenta')).data,
  });
  const { data: usuarios } = useUsuarios();
  const [empleado, setEmpleado] = useState<Consolidado | null>(null);
  const [seleccion, setSeleccion] = useState('');

  if (empleado) {
    return <DetalleEmpleado empleado={empleado} onVolver={() => setEmpleado(null)} />;
  }

  // Solo empleados operativos tienen estado de cuenta (cobradores y supervisores)
  const empleados = (usuarios ?? []).filter((u) => u.rol === 'COBRADOR' || u.rol === 'SUPERVISOR');

  const abrirEmpleado = (id: number) => {
    const u = empleados.find((e) => e.id === id);
    if (!u) return;
    setEmpleado({
      empleado_id: u.id, nombre: u.nombre, rol: u.rol,
      saldo_pendiente: 0, saldo_descuadres: 0, saldo_prestamos: 0, obligaciones_activas: 0,
    });
  };

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Estado de cuenta de empleados</h2>
        <p className="page-subtitle">Obligaciones financieras de los colaboradores: descuadres y préstamos internos.</p>
      </div>

      {/* Selector: abrir el estado de cuenta de cualquier empleado (tenga o no obligaciones) */}
      <div className="card card-pad mb-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <label className="label">Abrir estado de cuenta de un empleado</label>
          <select value={seleccion} onChange={(e) => setSeleccion(e.target.value)} className="input">
            <option value="">Selecciona un empleado…</option>
            {empleados.map((u) => (
              <option key={u.id} value={u.id}>{u.nombre} · {u.rol.toLowerCase()}</option>
            ))}
          </select>
        </div>
        <button onClick={() => seleccion && abrirEmpleado(Number(seleccion))}
          disabled={!seleccion} className="btn-primary btn-sm">
          Abrir / registrar préstamo
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : !data?.data || data.data.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-gradient-to-b from-slate-50/80 to-white py-14 text-center">
          <p className="text-base font-semibold text-slate-700">Sin obligaciones pendientes</p>
          <p className="mt-1 text-sm text-slate-500">Ningún empleado tiene saldos pendientes. Usa el selector de arriba para abrir el estado de cuenta de un empleado y registrarle un préstamo.</p>
        </div>
      ) : (
        <>
          <div className="card card-pad mb-4 flex items-center justify-between">
            <span className="text-sm text-slate-500">Total pendiente por cobrar a empleados</span>
            <span className="font-display text-xl font-bold text-rose-600">{money(data.total_pendiente)}</span>
          </div>
          <div className="space-y-2">
            {(data.data as Consolidado[]).map((e) => (
              <div key={e.empleado_id} className="card card-pad flex cursor-pointer items-center justify-between hover:ring-1 hover:ring-brand-200"
                onClick={() => setEmpleado(e)}>
                <div>
                  <div className="font-semibold text-slate-800">{e.nombre}</div>
                  <div className="text-xs text-slate-400">
                    {e.rol?.toLowerCase()} · {e.obligaciones_activas} obligación(es) activa(s)
                  </div>
                  <div className="mt-1 flex gap-2 text-xs">
                    {e.saldo_descuadres > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">Descuadres {money(e.saldo_descuadres)}</span>}
                    {e.saldo_prestamos > 0 && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-brand-700">Préstamos {money(e.saldo_prestamos)}</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-display text-lg font-bold text-rose-600">{money(e.saldo_pendiente)}</div>
                  <div className="text-xs text-slate-400">pendiente ▸</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

interface Obligacion {
  id: number; tipo: string; concepto: string; observaciones?: string;
  monto_original: number; saldo: number; estado: string; created_at: string;
}
interface Movimiento {
  id: number; tipo: string; concepto: string; debito: number; credito: number;
  saldo_obligacion: number; observaciones?: string; created_at: string; registrado_por?: string;
}

function DetalleEmpleado({ empleado, onVolver }: { empleado: Consolidado; onVolver: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['estado-cuenta', empleado.empleado_id],
    queryFn: async () => (await api.get(`/empleados/${empleado.empleado_id}/estado-cuenta`)).data.data,
  });
  const [nuevoPrestamo, setNuevoPrestamo] = useState(false);
  const [abonarA, setAbonarA] = useState<Obligacion | null>(null);

  const r = data?.resumen;

  return (
    <div>
      <button onClick={onVolver} className="mb-3 text-sm text-brand-600 hover:underline">← Volver al listado</button>
      <div className="page-header flex items-center justify-between">
        <div>
          <h2 className="page-title">{empleado.nombre}</h2>
          <p className="page-subtitle">Estado de cuenta · {empleado.rol?.toLowerCase()}</p>
        </div>
        <div className="flex gap-2">
          {data && <button onClick={() => exportarExcel(empleado, data)} className="btn-outline btn-sm">Excel</button>}
          <button onClick={() => setNuevoPrestamo(true)} className="btn-primary btn-sm">Registrar préstamo</button>
        </div>
      </div>

      {/* Indicadores */}
      {r && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Indicador titulo="Saldo pendiente" valor={money(r.saldo_total)} tono="rose" />
          <Indicador titulo="Descuadres" valor={money(r.saldo_descuadres)} />
          <Indicador titulo="Préstamos" valor={money(r.saldo_prestamos)} />
          <Indicador titulo="Total pagado" valor={money(r.total_pagado)} tono="money" />
          <Indicador titulo="Obligaciones activas" valor={String(r.obligaciones_activas)} />
          <Indicador titulo="Obligaciones pagadas" valor={String(r.obligaciones_pagadas)} />
          <Indicador titulo="Último pago" valor={r.ultimo_pago ? money(r.ultimo_pago.valor) : '—'}
            detalle={r.ultimo_pago ? fecha(r.ultimo_pago.fecha) : undefined} />
          <Indicador titulo="Último movimiento" valor={r.ultimo_movimiento ? fecha(r.ultimo_movimiento) : '—'} />
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : (
        <>
          {/* Obligaciones */}
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Obligaciones</h3>
          <div className="mb-5 space-y-2">
            {(data.obligaciones as Obligacion[]).length === 0 ? (
              <p className="rounded-xl bg-slate-50 py-6 text-center text-sm text-slate-400">Sin obligaciones registradas.</p>
            ) : (data.obligaciones as Obligacion[]).map((o) => (
              <div key={o.id} className="card card-pad flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-700">{o.concepto}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${o.estado === 'PAGADO' ? 'bg-money-50 text-money-700' : 'bg-amber-50 text-amber-800'}`}>
                      {o.estado === 'PAGADO' ? 'Pagado' : 'Pendiente'}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${o.tipo === 'DESCUADRE_CAJA' ? 'bg-amber-100 text-amber-800' : 'bg-brand-50 text-brand-700'}`}>
                      {o.tipo === 'DESCUADRE_CAJA' ? 'Descuadre' : 'Préstamo'}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {fecha(o.created_at)} · Monto original {money(o.monto_original)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="font-display text-base font-bold tabular-nums">{money(o.saldo)}</div>
                    <div className="text-xs text-slate-400">saldo</div>
                  </div>
                  {o.estado !== 'PAGADO' && (
                    <button onClick={() => setAbonarA(o)} className="btn-primary btn-sm">Abonar</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Extracto de movimientos */}
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Movimientos (extracto)</h3>
          <div className="table-wrap">
            <table className="table-base">
              <thead><tr><th>Fecha</th><th>Concepto</th><th className="text-right">Débito</th><th className="text-right">Crédito</th><th className="text-right">Saldo</th><th>Usuario</th></tr></thead>
              <tbody>
                {(data.movimientos as Movimiento[]).length === 0 ? (
                  <tr><td colSpan={6} className="py-6 text-center text-slate-400">Sin movimientos.</td></tr>
                ) : (data.movimientos as Movimiento[]).map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap text-xs">{fechaHora(m.created_at)}</td>
                    <td>{m.concepto}</td>
                    <td className="text-right tabular-nums text-rose-600">{m.debito > 0 ? money(m.debito) : '—'}</td>
                    <td className="text-right tabular-nums text-money-700">{m.credito > 0 ? money(m.credito) : '—'}</td>
                    <td className="text-right tabular-nums">{money(m.saldo_obligacion)}</td>
                    <td className="text-xs text-slate-400">{m.registrado_por ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {nuevoPrestamo && <ModalPrestamo empleadoId={empleado.empleado_id} onClose={() => setNuevoPrestamo(false)} />}
      {abonarA && <ModalAbono empleadoId={empleado.empleado_id} obligacion={abonarA} onClose={() => setAbonarA(null)} />}
    </div>
  );
}

function Indicador({ titulo, valor, detalle, tono = 'neutro' }: { titulo: string; valor: string; detalle?: string; tono?: string }) {
  const cls = { rose: 'text-rose-600', money: 'text-money-700', neutro: 'text-slate-800' }[tono] ?? 'text-slate-800';
  return (
    <div className="card card-pad">
      <div className="text-xs uppercase tracking-wide text-slate-400">{titulo}</div>
      <div className={`mt-1 font-display text-lg font-bold ${cls}`}>{valor}</div>
      {detalle && <div className="text-xs text-slate-400">{detalle}</div>}
    </div>
  );
}

function ModalPrestamo({ empleadoId, onClose }: { empleadoId: number; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('');
  const [obs, setObs] = useState('');

  const crear = useMutation({
    mutationFn: async () => (await api.post(`/empleados/${empleadoId}/prestamos`, {
      monto: Number(monto), concepto, observaciones: obs || undefined,
    })).data,
    onSuccess: () => {
      toast.exito('Préstamo registrado ✓');
      qc.invalidateQueries({ queryKey: ['estado-cuenta', empleadoId] });
      qc.invalidateQueries({ queryKey: ['estado-cuenta-consolidado'] });
      onClose();
    },
    onError: () => toast.error('No se pudo registrar.'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="animate-fade-in-scale w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold text-slate-800">Registrar préstamo interno</h3>
        <p className="mb-4 text-sm text-slate-500">Sin intereses, sin plazo. El saldo se reduce con abonos.</p>
        <label className="label">Monto</label>
        <input type="number" value={monto} onChange={(e) => setMonto(e.target.value)} className="input" placeholder="0" />
        <label className="label mt-3">Concepto</label>
        <input value={concepto} onChange={(e) => setConcepto(e.target.value)} className="input" placeholder="Préstamo para…" />
        <label className="label mt-3">Observaciones</label>
        <textarea value={obs} onChange={(e) => setObs(e.target.value)} className="input" rows={2} />
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="btn-outline btn-sm flex-1">Cancelar</button>
          <button onClick={() => crear.mutate()} disabled={!monto || !concepto || crear.isPending} className="btn-primary btn-sm flex-1">
            {crear.isPending && <span className="spinner" />}Registrar
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalAbono({ empleadoId, obligacion, onClose }: { empleadoId: number; obligacion: Obligacion; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [monto, setMonto] = useState('');
  const [obs, setObs] = useState('');

  const abonar = useMutation({
    mutationFn: async () => (await api.post(`/empleados/${empleadoId}/obligaciones/${obligacion.id}/abonar`, {
      monto: Number(monto), observaciones: obs || undefined,
    })).data,
    onSuccess: (res) => {
      toast.exito(res.estado === 'PAGADO' ? 'Obligación pagada por completo ✓' : 'Abono registrado ✓');
      qc.invalidateQueries({ queryKey: ['estado-cuenta', empleadoId] });
      qc.invalidateQueries({ queryKey: ['estado-cuenta-consolidado'] });
      onClose();
    },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo abonar.'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="animate-fade-in-scale w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold text-slate-800">Registrar abono</h3>
        <p className="mb-1 text-sm text-slate-500">{obligacion.concepto}</p>
        <p className="mb-4 text-sm font-medium text-slate-700">Saldo actual: {money(obligacion.saldo)}</p>
        <label className="label">Monto del abono</label>
        <input type="number" value={monto} onChange={(e) => setMonto(e.target.value)} className="input" placeholder="0" max={obligacion.saldo} />
        <button onClick={() => setMonto(String(obligacion.saldo))} className="mt-1 text-xs text-brand-600 hover:underline">Pagar saldo total ({money(obligacion.saldo)})</button>
        <label className="label mt-3">Observaciones</label>
        <textarea value={obs} onChange={(e) => setObs(e.target.value)} className="input" rows={2} />
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="btn-outline btn-sm flex-1">Cancelar</button>
          <button onClick={() => abonar.mutate()} disabled={!monto || abonar.isPending} className="btn-primary btn-sm flex-1">
            {abonar.isPending && <span className="spinner" />}Abonar
          </button>
        </div>
      </div>
    </div>
  );
}

function exportarExcel(empleado: Consolidado, data: { obligaciones: Obligacion[]; movimientos: Movimiento[] }) {
  const wb = XLSX.utils.book_new();
  const obligaciones = data.obligaciones.map((o) => ({
    Concepto: o.concepto, Tipo: o.tipo, Estado: o.estado,
    'Monto original': o.monto_original, Saldo: o.saldo, Fecha: o.created_at?.slice(0, 10),
  }));
  const movimientos = data.movimientos.map((m) => ({
    Fecha: m.created_at?.slice(0, 19).replace('T', ' '), Concepto: m.concepto,
    Débito: m.debito, Crédito: m.credito, Saldo: m.saldo_obligacion, Usuario: m.registrado_por,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(obligaciones), 'Obligaciones');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(movimientos), 'Movimientos');
  XLSX.writeFile(wb, `estado_cuenta_${empleado.nombre.replace(/\s+/g, '_')}.xlsx`);
}

import { useState } from 'react';
import { EstadoBadge } from '@/components/ui/EstadoBadge';
import { money } from '@/lib/format';
import type { Solicitud } from '@/types';
import { useAnularPago, useCreditoDetalle, useCreditos, useCuotasCredito, useDesembolsar, useEliminarCredito, useEventosCredito, useGenerarCronograma, useRegistrarPago } from './hooks';
import { useAuthStore } from '@/stores/auth';

function reciboWhatsApp(credito: Solicitud, p: { fecha: string; hora?: string | null; valor: number; metodo: string }): string | null {
  const tel = (credito.cliente_telefono ?? '').replace(/\D/g, '');
  if (!tel) return null;
  const telFull = tel.length === 10 ? `57${tel}` : tel;
  const msg =
    `🧾 *RECIBO DE PAGO*\n\n` +
    `Crédito: ${credito.numero_credito ?? `#${credito.id}`}\n` +
    `Cliente: ${credito.cliente ?? ''}\n` +
    `Fecha: ${p.fecha}${p.hora ? ` · ${p.hora}` : ''}\n` +
    `Valor pagado: ${money(p.valor)}\n` +
    `Medio: ${p.metodo === 'TRANSFERENCIA' ? 'Transferencia' : 'Efectivo'}\n` +
    `Saldo pendiente: ${money(credito.saldo_pendiente)}\n\n` +
    `¡Gracias por tu pago puntual!`;
  return `https://wa.me/${telFull}?text=${encodeURIComponent(msg)}`;
}

function leerBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] ?? '');
    r.onerror = () => rej(new Error('No se pudo leer el archivo'));
    r.readAsDataURL(file);
  });
}

const METODOS = [
  { v: 'EFECTIVO', t: 'Efectivo' },
  { v: 'TRANSFERENCIA', t: 'Transferencia' },
];

export function CarteraPanel() {
  const [buscar, setBuscar] = useState('');
  const { data, isLoading } = useCreditos(buscar);

  return (
    <div>
      <h2 className="mb-1 text-xl font-bold">Cartera y pagos</h2>
      <p className="mb-5 text-sm text-slate-500">Desembolsa créditos aprobados y registra los pagos de cada cuota.</p>

      <div className="mb-4">
        <input value={buscar} onChange={(e) => setBuscar(e.target.value)}
          placeholder="Buscar por nombre, cédula o N° de crédito…"
          className="input max-w-md" />
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">Cargando créditos…</p>
      ) : !data || data.length === 0 ? (
        <p className="card card-pad border-2 border-dashed border-slate-200 text-center text-sm text-slate-500 shadow-none ring-0">
          {buscar ? 'Sin resultados para esa búsqueda.' : 'No hay créditos operables. Aprueba una solicitud para verla aquí.'}
        </p>
      ) : (
        <div className="space-y-4">
          {data.map((c) => <CreditoCard key={c.id} c={c} />)}
        </div>
      )}
    </div>
  );
}

function CreditoCard({ c }: { c: Solicitud }) {
  const [abierto, setAbierto] = useState(false);
  const desembolsar = useDesembolsar();
  const [metodo, setMetodo] = useState('EFECTIVO');
  const [fechaInicio, setFechaInicio] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);

  const esAprobado = c.estado === 'APROBADO';
  const esPagable = ['ACTIVO', 'EN_MORA', 'DESEMBOLSADO'].includes(c.estado);
  const rolActual = useAuthStore((st) => st.usuario?.rol);
  const eliminar = useEliminarCredito();
  const [borrando, setBorrando] = useState(false);
  const [clave, setClave] = useState('');

  const err = (e: unknown) => {
    const x = e as { response?: { data?: { message?: string } } };
    setError(x?.response?.data?.message ?? 'No se pudo completar la acción.');
  };

  return (
    <div className="card card-pad">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-semibold">
            {c.numero_credito ?? `Crédito #${c.id}`} · {c.cliente ?? `Cliente ${c.cliente_id}`}
          </div>
          <div className="flex items-center gap-2">
            <EstadoBadge estado={c.estado} />
            {c.credito_origen && (
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-800">
                Renovación de {c.credito_origen}
              </span>
            )}
          </div>
        </div>
        <div className="text-right text-sm">
          <div className="text-slate-500">Saldo pendiente</div>
          <div className="font-semibold">{money(c.saldo_pendiente ?? c.total_recaudar)}</div>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        <Item label="Capital" value={money(c.monto_aprobado)} />
        <Item label="Total deuda" value={money(c.total_recaudar)} />
        <Item label="Cuotas" value={`${c.numero_cuotas}`} />
      </dl>

      {error && <p className="mt-3 alert-error">{error}</p>}

      {esAprobado && (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block text-slate-500">Fecha de inicio del crédito</span>
            <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="input" />
          </label>
          <label className="text-sm">
            <span className="block text-slate-500">Medio de entrega</span>
            <select value={metodo} onChange={(e) => setMetodo(e.target.value)} className="input">
              {METODOS.map((m) => <option key={m.v} value={m.v}>{m.t}</option>)}
            </select>
          </label>
          <button
            onClick={() => {
              setError(null);
              if (!fechaInicio) { setError('Indica la fecha de inicio del crédito.'); return; }
              desembolsar.mutate({ id: c.id, metodo, fecha: fechaInicio }, { onError: err });
            }}
            disabled={desembolsar.isPending}
            className="btn-primary btn-sm">
            {desembolsar.isPending ? 'Desembolsando…' : 'Desembolsar y activar'}
          </button>
          <p className="w-full text-xs text-slate-400">La primera cuota vence un período después de esta fecha, según la modalidad.</p>
        </div>
      )}

      {esPagable && (
        <div className="mt-4">
          <button onClick={() => setAbierto(!abierto)} className="text-sm text-brand underline">
            {abierto ? 'Ocultar ficha' : 'Ver ficha: plan, pagos y registro'}
          </button>
          {abierto && <FichaCredito creditoId={c.id} />}
        </div>
      )}

      {rolActual === 'ADMINISTRADOR' && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          {!borrando ? (
            <button onClick={() => { setError(null); setBorrando(true); }} className="text-xs text-rose-600 hover:underline">
              Eliminar crédito
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <input type="password" value={clave} onChange={(e) => setClave(e.target.value)}
                placeholder="Clave de eliminación" className="input max-w-[200px] py-1.5 text-sm" />
              <button
                onClick={() => { setError(null); eliminar.mutate({ id: c.id, clave }, { onError: err }); }}
                disabled={eliminar.isPending || !clave}
                className="btn btn-sm bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50">
                {eliminar.isPending ? 'Eliminando…' : 'Confirmar'}
              </button>
              <button onClick={() => { setBorrando(false); setClave(''); }} className="btn-ghost btn-sm">Cancelar</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FichaCredito({ creditoId }: { creditoId: number }) {
  const { data: credito, isLoading, isError, error: qError } = useCreditoDetalle(creditoId);
  const pagar = useRegistrarPago();
  const { data: cuotasData } = useCuotasCredito(creditoId);
  const cuotas = cuotasData?.data ?? [];
  const pagosExtracto = cuotasData?.pagos ?? [];
  const generar = useGenerarCronograma();
  const rol = useAuthStore((st) => st.usuario?.rol);
  const puedeGenerar = rol === 'ADMINISTRADOR' || rol === 'SUPERVISOR';
  const [valor, setValor] = useState('');
  const [metodo, setMetodo] = useState('EFECTIVO');
  const [obs, setObs] = useState('');
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [banco, setBanco] = useState('');
  const [referencia, setReferencia] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) return <p className="mt-3 text-sm text-slate-500">Cargando ficha…</p>;
  if (isError) {
    const e = qError as { response?: { data?: { message?: string; diag?: unknown }; status?: number } };
    return (
      <div className="mt-3 alert-error">
        <p>No se pudo cargar la ficha ({e?.response?.status ?? 'error'}): {e?.response?.data?.message ?? 'intenta de nuevo.'}</p>
        {e?.response?.data?.diag != null && (
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-[11px] leading-snug">
            {JSON.stringify(e.response.data.diag, null, 1)}
          </pre>
        )}
      </div>
    );
  }
  if (!credito) return null;

  const sinCuotas = cuotas.length === 0;

  const onPagar = async () => {
    setError(null); setMsg(null);
    const v = Number(valor);
    if (!v || v <= 0) { setError('Ingresa un valor mayor a 0.'); return; }
    let comp: { nombre: string; mime: string; tamano: number; contenido_base64: string } | undefined;
    if (metodo === 'TRANSFERENCIA' && comprobante) {
      if (comprobante.size > 2 * 1024 * 1024) { setError('El comprobante supera 2 MB.'); return; }
      comp = { nombre: comprobante.name, mime: comprobante.type, tamano: comprobante.size, contenido_base64: await leerBase64(comprobante) };
    }
    pagar.mutate(
      { solicitud_id: creditoId, valor: v, metodo, observaciones: obs || undefined,
        banco: metodo === 'TRANSFERENCIA' && banco ? banco : undefined,
        referencia: metodo === 'TRANSFERENCIA' && referencia ? referencia : undefined,
        comprobante: comp, client_uuid: crypto.randomUUID() },
      {
        onSuccess: () => {
          setMsg(metodo === 'TRANSFERENCIA'
            ? 'Pago por transferencia registrado. Se aplicará al saldo cuando el supervisor lo apruebe.'
            : 'Pago registrado ✓');
          setValor(''); setObs(''); setComprobante(null); setBanco(''); setReferencia('');
        },
        onError: (e) => {
          const x = e as { message?: string; response?: { data?: { message?: string } } };
          if (x?.message === 'OFFLINE_ENCOLADO') setMsg('Sin conexión: el pago se guardó y se sincronizará al recuperar internet.');
          else setError(x?.response?.data?.message ?? 'No se pudo registrar el pago.');
        },
      },
    );
  };

  return (
    <div className="mt-3 space-y-5">
      {/* PLAN DE PAGOS */}
      <div>
        <h4 className="mb-2 text-sm font-semibold text-slate-700">Plan de pagos</h4>
        {sinCuotas ? (
          <div className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800 ring-1 ring-amber-100">
            <p>Este crédito no tiene cuotas generadas.</p>
            {puedeGenerar && (
              <button onClick={() => {
                  setError(null); setMsg(null);
                  generar.mutate(creditoId, {
                    onSuccess: () => setMsg('Plan de pagos generado ✓'),
                    onError: (e: unknown) => {
                      const x = e as { response?: { data?: { message?: string } } };
                      setError(x?.response?.data?.message ?? 'No se pudo generar el plan.');
                    },
                  });
                }} disabled={generar.isPending}
                className="btn-primary btn-sm mt-2">
                {generar.isPending ? 'Generando…' : 'Generar plan de pagos'}
              </button>
            )}
            {error && <p className="mt-2 alert-error">{error}</p>}
            {msg && <p className="mt-2 text-sm text-green-700">{msg}</p>}
          </div>
        ) : (
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>
                <th className="px-3 py-2">#</th><th className="px-3 py-2">Vence</th>
                <th className="px-3 py-2">Capital</th><th className="px-3 py-2">Interés</th>
                <th className="px-3 py-2">Valor</th><th className="px-3 py-2">Pagado</th>
                <th className="px-3 py-2">Saldo</th><th className="px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {cuotas.map((q) => (
                <tr key={q.numero_cuota} className="border-t">
                  <td className="px-3 py-2">{q.numero_cuota}</td>
                  <td className="px-3 py-2">{q.fecha_vencimiento}</td>
                  <td className="px-3 py-2">{money(q.abono_capital ?? 0)}</td>
                  <td className="px-3 py-2">{money(q.abono_interes ?? 0)}</td>
                  <td className="px-3 py-2">{money(q.valor)}</td>
                  <td className="px-3 py-2">{money(q.valor_pagado)}</td>
                  <td className="px-3 py-2">{money(q.saldo)}</td>
                  <td className="px-3 py-2">{q.estado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {/* REGISTRAR PAGO */}
      <div>
        <h4 className="mb-2 text-sm font-semibold text-slate-700">Registrar pago</h4>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="block font-medium">Valor</span>
            <input type="number" step="any" value={valor} onChange={(e) => setValor(e.target.value)}
              className="input w-36" />
          </label>
          <label className="text-sm">
            <span className="block font-medium">Medio</span>
            <select value={metodo} onChange={(e) => setMetodo(e.target.value)}
              className="input">
              {METODOS.map((m) => <option key={m.v} value={m.v}>{m.t}</option>)}
            </select>
          </label>
          <label className="flex-1 min-w-[160px] text-sm">
            <span className="block font-medium">Observaciones (opcional)</span>
            <input value={obs} onChange={(e) => setObs(e.target.value)}
              className="input" />
          </label>
          <button onClick={onPagar} disabled={pagar.isPending}
            className="btn-primary btn-sm">
            {pagar.isPending ? 'Registrando…' : 'Registrar pago'}
          </button>
        </div>
        {metodo === 'TRANSFERENCIA' && (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap gap-2">
              <input value={banco} onChange={(e) => setBanco(e.target.value)}
                placeholder="Banco (ej. Bancolombia)" className="input max-w-[190px] py-1.5 text-sm" />
              <input value={referencia} onChange={(e) => setReferencia(e.target.value)}
                placeholder="N° de referencia" className="input max-w-[190px] py-1.5 text-sm" />
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-brand ring-1 ring-brand-200 hover:bg-brand-50">
              {comprobante ? 'Cambiar comprobante' : 'Adjuntar comprobante (imagen, máx 2 MB)'}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                onChange={(e) => setComprobante(e.target.files?.[0] ?? null)} />
            </label>
            {comprobante && <span className="ml-2 text-xs text-slate-500">{comprobante.name}</span>}
          </div>
        )}

        {msg && <p className="mt-2 text-sm text-green-700">{msg}</p>}
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        <p className="mt-1 text-xs text-slate-400">El pago se aplica a las cuotas pendientes, de la más antigua a la más reciente.</p>
      </div>

      {/* HISTORIAL DE PAGOS */}
      <div>
        <h4 className="mb-2 text-sm font-semibold text-slate-700">Pagos realizados</h4>
        {pagosExtracto.length === 0 ? (
          <p className="text-sm text-slate-500">Aún no hay pagos registrados.</p>
        ) : (
          <div className="table-wrap">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Hora</th>
                  <th className="px-3 py-2">Medio</th><th className="px-3 py-2">Valor</th>
                  <th className="px-3 py-2">Registró</th><th className="px-3 py-2">Obs.</th><th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {pagosExtracto.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="px-3 py-2">{p.fecha}</td>
                    <td className="px-3 py-2">{p.hora ?? '—'}</td>
                    <td className="px-3 py-2">
                      {p.metodo}
                      {p.aplicado === false && (
                        <span className="ml-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800 ring-1 ring-amber-100">
                          En validación
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{money(p.valor)}</td>
                    <td className="px-3 py-2">{p.registrado_por ?? '—'}</td>
                    <td className="px-3 py-2">{p.observaciones ?? '—'}</td>
                    <td className="px-3 py-2">
                      <AccionesPago p={p} credito={credito} creditoId={creditoId} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* HISTORIAL DEL CRÉDITO */}
      <HistorialCredito creditoId={creditoId} />
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

const EVENTO_COLOR: Record<string, string> = {
  CREACION: 'bg-slate-400', APROBACION: 'bg-brand', RECHAZO: 'bg-rose-500',
  DESEMBOLSO: 'bg-money-600', PAGO: 'bg-money-600', REAMORTIZACION: 'bg-amber-500', CIERRE: 'bg-ink',
};

function fmtEvento(iso: string) {
  try {
    return new Date(iso).toLocaleString('es-CO', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function HistorialCredito({ creditoId }: { creditoId: number }) {
  const [abierto, setAbierto] = useState(false);
  const { data: eventos, isLoading } = useEventosCredito(creditoId, abierto);

  return (
    <div>
      <button onClick={() => setAbierto(!abierto)} className="text-sm font-medium text-brand hover:underline">
        {abierto ? 'Ocultar historial del crédito' : 'Ver historial del crédito'}
      </button>

      {abierto && (
        <div className="mt-3">
          {isLoading ? (
            <p className="text-sm text-slate-500">Cargando historial…</p>
          ) : !eventos || eventos.length === 0 ? (
            <p className="text-sm text-slate-500">Sin eventos registrados.</p>
          ) : (
            <ol className="relative ml-2 space-y-4 border-l-2 border-slate-100 pl-5">
              {eventos.map((e, i) => (
                <li key={i} className="relative">
                  <span className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full ring-4 ring-white ${EVENTO_COLOR[e.tipo] ?? 'bg-slate-400'}`} />
                  <div className="text-sm font-semibold text-slate-800">{e.titulo}</div>
                  {e.detalle && <div className="text-sm text-slate-600">{e.detalle}</div>}
                  <div className="mt-0.5 text-xs text-slate-400">
                    {fmtEvento(e.fecha)}{e.usuario ? ` · ${e.usuario}` : ''}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

function AccionesPago({ p, credito, creditoId }:
  { p: import('./hooks').PagoFila; credito: Solicitud; creditoId: number }) {
  const rol = useAuthStore((st) => st.usuario?.rol);
  const anular = useAnularPago();
  const [pidiendo, setPidiendo] = useState(false);
  const [clave, setClave] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const wa = p.aplicado !== false ? reciboWhatsApp(credito, p) : null;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1.5 whitespace-nowrap">
        {wa && (
          <a href={wa} target="_blank" rel="noreferrer" className="text-xs font-medium text-money-700 hover:underline">
            Recibo
          </a>
        )}
        {rol === 'ADMINISTRADOR' && (
          !pidiendo ? (
            <button onClick={() => { setErr(null); setPidiendo(true); }}
              className="text-xs text-rose-600 hover:underline">Anular</button>
          ) : null
        )}
      </div>
      {pidiendo && (
        <div className="flex items-center gap-1.5">
          <input type="password" value={clave} onChange={(e) => setClave(e.target.value)}
            placeholder="Clave" className="input max-w-[110px] py-1 text-xs" />
          <button
            onClick={() => anular.mutate({ id: p.id, clave, creditoId }, {
              onSuccess: () => setPidiendo(false),
              onError: (e: unknown) => {
                const x = e as { response?: { data?: { message?: string } } };
                setErr(x?.response?.data?.message ?? 'No se pudo anular.');
              },
            })}
            disabled={anular.isPending || !clave}
            className="btn btn-sm bg-rose-600 px-2 py-1 text-xs text-white hover:bg-rose-700 disabled:opacity-50">
            {anular.isPending ? '…' : 'OK'}
          </button>
          <button onClick={() => setPidiendo(false)} className="text-xs text-slate-400 hover:underline">✕</button>
        </div>
      )}
      {err && <span className="text-[11px] text-rose-600">{err}</span>}
    </div>
  );
}

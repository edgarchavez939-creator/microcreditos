import { useState } from 'react';
import { EstadoBadge } from '@/components/ui/EstadoBadge';
import { money } from '@/lib/format';
import type { Solicitud } from '@/types';
import { useCreditoDetalle, useCreditos, useDesembolsar, useRegistrarPago } from './hooks';

const METODOS = [
  { v: 'EFECTIVO', t: 'Efectivo' },
  { v: 'TRANSFERENCIA', t: 'Transferencia' },
];

export function CarteraPanel() {
  const { data, isLoading } = useCreditos();

  return (
    <div>
      <h2 className="mb-1 text-xl font-bold">Cartera y pagos</h2>
      <p className="mb-5 text-sm text-slate-500">Desembolsa créditos aprobados y registra los pagos de cada cuota.</p>
      {isLoading ? (
        <p className="text-sm text-slate-500">Cargando créditos…</p>
      ) : !data || data.length === 0 ? (
        <p className="card card-pad border-2 border-dashed border-slate-200 text-center text-sm text-slate-500 shadow-none ring-0">
          No hay créditos operables. Aprueba una solicitud para verla aquí.
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
  const [error, setError] = useState<string | null>(null);

  const esAprobado = c.estado === 'APROBADO';
  const esPagable = ['ACTIVO', 'EN_MORA', 'DESEMBOLSADO'].includes(c.estado);

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
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-500">Medio de entrega:</span>
          <select value={metodo} onChange={(e) => setMetodo(e.target.value)}
            className="input">
            {METODOS.map((m) => <option key={m.v} value={m.v}>{m.t}</option>)}
          </select>
          <button
            onClick={() => { setError(null); desembolsar.mutate({ id: c.id, metodo }, { onError: err }); }}
            disabled={desembolsar.isPending}
            className="btn-primary btn-sm">
            {desembolsar.isPending ? 'Desembolsando…' : 'Desembolsar y activar'}
          </button>
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
    </div>
  );
}

function FichaCredito({ creditoId }: { creditoId: number }) {
  const { data: credito, isLoading } = useCreditoDetalle(creditoId);
  const pagar = useRegistrarPago();
  const [valor, setValor] = useState('');
  const [metodo, setMetodo] = useState('EFECTIVO');
  const [obs, setObs] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) return <p className="mt-2 text-sm text-slate-500">Cargando ficha…</p>;
  if (!credito) return null;

  const onPagar = () => {
    setError(null); setMsg(null);
    const v = Number(valor);
    if (!v || v <= 0) { setError('Ingresa un valor mayor a 0.'); return; }
    pagar.mutate(
      { solicitud_id: creditoId, valor: v, metodo, observaciones: obs || undefined, client_uuid: crypto.randomUUID() },
      {
        onSuccess: () => { setMsg('Pago registrado ✓'); setValor(''); setObs(''); },
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
              {credito.cuotas?.map((q) => (
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
        {msg && <p className="mt-2 text-sm text-green-700">{msg}</p>}
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        <p className="mt-1 text-xs text-slate-400">El pago se aplica a las cuotas pendientes, de la más antigua a la más reciente.</p>
      </div>

      {/* HISTORIAL DE PAGOS */}
      <div>
        <h4 className="mb-2 text-sm font-semibold text-slate-700">Pagos realizados</h4>
        {!credito.pagos || credito.pagos.length === 0 ? (
          <p className="text-sm text-slate-500">Aún no hay pagos registrados.</p>
        ) : (
          <div className="table-wrap">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Hora</th>
                  <th className="px-3 py-2">Medio</th><th className="px-3 py-2">Valor</th>
                  <th className="px-3 py-2">Registró</th><th className="px-3 py-2">Obs.</th>
                </tr>
              </thead>
              <tbody>
                {credito.pagos.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="px-3 py-2">{p.fecha}</td>
                    <td className="px-3 py-2">{p.hora ?? '—'}</td>
                    <td className="px-3 py-2">{p.metodo}</td>
                    <td className="px-3 py-2">{money(p.valor)}</td>
                    <td className="px-3 py-2">{p.registrado_por ?? '—'}</td>
                    <td className="px-3 py-2">{p.observaciones ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
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

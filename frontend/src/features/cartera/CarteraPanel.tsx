import { useState } from 'react';
import { EstadoBadge } from '@/components/ui/EstadoBadge';
import { money } from '@/lib/format';
import type { Solicitud } from '@/types';
import { useCreditoDetalle, useCreditos, useDesembolsar, useRegistrarPago } from './hooks';

export function CarteraPanel() {
  const { data, isLoading } = useCreditos();

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">Cartera</h2>
      {isLoading ? (
        <p className="text-sm text-slate-500">Cargando créditos…</p>
      ) : !data || data.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">
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
    <div className="rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-semibold">Crédito #{c.id} · {c.cliente ?? `Cliente ${c.cliente_id}`}</div>
          <EstadoBadge estado={c.estado} />
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

      {error && <p className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {esAprobado && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <select value={metodo} onChange={(e) => setMetodo(e.target.value)}
            className="rounded border px-2 py-1.5 text-sm bg-white">
            <option value="EFECTIVO">Efectivo</option>
            <option value="TRANSFERENCIA">Transferencia</option>
            <option value="NEQUI">Nequi</option>
            <option value="DAVIPLATA">Daviplata</option>
          </select>
          <button
            onClick={() => { setError(null); desembolsar.mutate({ id: c.id, metodo }, { onError: err }); }}
            disabled={desembolsar.isPending}
            className="rounded bg-brand px-4 py-1.5 text-sm text-white disabled:opacity-50">
            {desembolsar.isPending ? 'Desembolsando…' : 'Desembolsar y activar'}
          </button>
        </div>
      )}

      {esPagable && (
        <div className="mt-4">
          <button onClick={() => setAbierto(!abierto)} className="text-sm text-brand underline">
            {abierto ? 'Ocultar cuotas' : 'Ver cuotas y registrar pago'}
          </button>
          {abierto && <DetalleCredito creditoId={c.id} />}
        </div>
      )}
    </div>
  );
}

function DetalleCredito({ creditoId }: { creditoId: number }) {
  const { data: credito, isLoading } = useCreditoDetalle(creditoId);
  const pagar = useRegistrarPago();
  const [valor, setValor] = useState('');
  const [metodo, setMetodo] = useState('EFECTIVO');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) return <p className="mt-2 text-sm text-slate-500">Cargando cuotas…</p>;
  if (!credito) return null;

  const onPagar = () => {
    setError(null); setMsg(null);
    const v = Number(valor);
    if (!v || v <= 0) { setError('Ingresa un valor mayor a 0.'); return; }
    pagar.mutate(
      { solicitud_id: creditoId, valor: v, metodo, client_uuid: crypto.randomUUID() },
      {
        onSuccess: () => { setMsg('Pago registrado ✓'); setValor(''); },
        onError: (e) => {
          const x = e as { message?: string; response?: { data?: { message?: string } } };
          if (x?.message === 'OFFLINE_ENCOLADO') setMsg('Sin conexión: el pago se guardó y se sincronizará al recuperar internet.');
          else setError(x?.response?.data?.message ?? 'No se pudo registrar el pago.');
        },
      },
    );
  };

  return (
    <div className="mt-3 space-y-3">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-3 py-2">Cuota</th><th className="px-3 py-2">Vence</th>
              <th className="px-3 py-2">Valor</th><th className="px-3 py-2">Pagado</th>
              <th className="px-3 py-2">Saldo</th><th className="px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {credito.cuotas?.map((q) => (
              <tr key={q.numero_cuota} className="border-t">
                <td className="px-3 py-2">{q.numero_cuota}</td>
                <td className="px-3 py-2">{q.fecha_vencimiento}</td>
                <td className="px-3 py-2">{money(q.valor)}</td>
                <td className="px-3 py-2">{money(q.valor_pagado)}</td>
                <td className="px-3 py-2">{money(q.saldo)}</td>
                <td className="px-3 py-2">{q.estado}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="block font-medium">Valor del pago</span>
          <input type="number" step="any" value={valor} onChange={(e) => setValor(e.target.value)}
            className="mt-1 w-40 rounded border px-3 py-2" />
        </label>
        <select value={metodo} onChange={(e) => setMetodo(e.target.value)}
          className="rounded border px-2 py-2 text-sm bg-white">
          <option value="EFECTIVO">Efectivo</option>
          <option value="TRANSFERENCIA">Transferencia</option>
          <option value="CONSIGNACION">Consignación</option>
          <option value="NEQUI">Nequi</option>
          <option value="DAVIPLATA">Daviplata</option>
        </select>
        <button onClick={onPagar} disabled={pagar.isPending}
          className="rounded bg-brand px-4 py-2 text-sm text-white disabled:opacity-50">
          {pagar.isPending ? 'Registrando…' : 'Registrar pago'}
        </button>
      </div>
      {msg && <p className="text-sm text-green-700">{msg}</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
      <p className="text-xs text-slate-400">El pago se aplica automáticamente a las cuotas pendientes, de la más antigua a la más reciente.</p>
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

import { EstadoBadge } from '@/components/ui/EstadoBadge';
import { money } from '@/lib/format';
import type { Solicitud } from '@/types';
import { useHistorialCredito } from './hooks';

export function HistorialCredito({ solicitudId }: { solicitudId: number }) {
  const { data, isLoading, isError } = useHistorialCredito(solicitudId);

  if (isLoading) return <p className="text-sm text-slate-500">Cargando historial…</p>;
  if (isError) return <p className="text-sm text-red-600">No se pudo cargar el historial.</p>;

  const cadena = data ?? [];
  if (cadena.length === 0) return <p className="text-sm text-slate-500">Sin renovaciones.</p>;

  return (
    <ol className="relative border-l border-slate-200 ml-3">
      {cadena.map((c, i) => (
        <li key={c.id} className="mb-6 ml-4">
          <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-white bg-brand" />
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">
                {i === 0 ? 'Crédito original' : `Renovación ${i}`} · #{c.id}
              </span>
              <EstadoBadge estado={c.estado} />
            </div>
            <CreditoResumen c={c} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function CreditoResumen({ c }: { c: Solicitud }) {
  return (
    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
      <Item label="Capital aprobado" value={money(c.monto_aprobado)} />
      <Item label="Interés" value={money(c.interes)} />
      <Item label="Seguro" value={money(c.valor_seguro)} />
      <Item label="Desembolsado" value={money(c.monto_desembolsado)} />
      <Item label="Deuda total" value={money(c.total_recaudar)} />
      <Item label="Saldo pendiente" value={money(c.saldo_pendiente ?? 0)} />
      {!!c.saldo_refinanciado && (
        <Item label="Saldo refinanciado" value={money(c.saldo_refinanciado)} />
      )}
      {!!c.plazo_meses && <Item label="Plazo" value={`${c.plazo_meses} meses`} />}
    </dl>
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

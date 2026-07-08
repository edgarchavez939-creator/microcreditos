import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { money } from '@/lib/format';
import { ReamortizacionPanel } from '@/features/renovaciones/ReamortizacionPanel';

interface CreditoReamortizar {
  solicitud_id: number;
  numero_credito: string;
  estado: string;
  cliente_id: number;
  cliente: string;
  telefono?: string | null;
  saldo_pendiente: number;
  cupo_disponible: number;
  condiciones: {
    tasa_interes: number;
    modalidad: string;
    plazo_meses: number;
    valor_cuota: number;
  };
}

export function BuscadorReamortizacion() {
  const [numero, setNumero] = useState('');
  const [credito, setCredito] = useState<CreditoReamortizar | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buscar = useMutation({
    mutationFn: async () =>
      (await api.get<{ data: CreditoReamortizar }>('/reamortizacion/buscar', { params: { numero } })).data.data,
    onSuccess: (d) => { setCredito(d); setError(null); },
    onError: (e: unknown) => {
      const x = e as { response?: { data?: { message?: string } } };
      setCredito(null);
      setError(x?.response?.data?.message ?? 'No se encontró el crédito.');
    },
  });

  if (credito) {
    return (
      <div>
        <div className="card card-pad mb-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-brand-700">Crédito a reamortizar</div>
              <div className="mt-0.5 font-semibold">{credito.numero_credito} · {credito.cliente}</div>
              <div className="mt-1 grid gap-x-6 gap-y-1 text-sm text-slate-600 sm:grid-cols-2">
                <span>Saldo pendiente: <b>{money(credito.saldo_pendiente)}</b></span>
                <span>Cupo disponible: <b>{money(credito.cupo_disponible)}</b></span>
                <span>Modalidad actual: {credito.condiciones.modalidad}</span>
                <span>Cuota actual: {money(credito.condiciones.valor_cuota)}</span>
              </div>
            </div>
            <button onClick={() => { setCredito(null); setNumero(''); }} className="btn-ghost btn-sm">Cambiar</button>
          </div>
        </div>
        <ReamortizacionPanel solicitudId={credito.solicitud_id} clienteId={credito.cliente_id} />
      </div>
    );
  }

  return (
    <div className="max-w-md">
      <label className="block text-sm">
        <span className="mb-1 block text-slate-600">Número del crédito</span>
        <div className="flex gap-2">
          <input
            value={numero}
            onChange={(e) => { setNumero(e.target.value.toUpperCase()); setError(null); }}
            placeholder="Ej. CR-000007 o 7"
            className="input"
            onKeyDown={(e) => { if (e.key === 'Enter' && numero) buscar.mutate(); }}
          />
          <button onClick={() => buscar.mutate()} disabled={buscar.isPending || !numero}
            className="btn-primary btn-sm whitespace-nowrap">
            {buscar.isPending ? 'Buscando…' : 'Buscar'}
          </button>
        </div>
      </label>
      {error && <p className="mt-3 alert-error">{error}</p>}
    </div>
  );
}

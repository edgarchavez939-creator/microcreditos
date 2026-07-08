import { ReamortizacionForm } from './ReamortizacionForm';
import { HistorialCredito } from './HistorialCredito';

interface Props {
  solicitudId: number;
  clienteId: number;
}

export function ReamortizacionPanel({ solicitudId, clienteId }: Props) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section>
        <h3 className="mb-3 text-base font-semibold">Reamortizar crédito #{solicitudId}</h3>
        <ReamortizacionForm solicitudId={solicitudId} clienteId={clienteId} />
      </section>
      <section>
        <h3 className="mb-3 text-base font-semibold">Historial del cliente</h3>
        <HistorialCredito solicitudId={solicitudId} />
      </section>
    </div>
  );
}

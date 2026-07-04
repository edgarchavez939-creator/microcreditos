import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { SolicitudForm } from '@/features/solicitudes/SolicitudForm';
import { ClienteForm } from '@/features/clientes/ClienteForm';

interface ClienteEncontrado {
  id: number;
  nombres: string;
  apellidos: string;
  tipo_documento: string;
  numero_documento: string;
  telefono_principal?: string | null;
  area_id: number;
  area?: string | null;
  cobrador?: string | null;
  activo: boolean;
}

export function BuscadorClienteSolicitud() {
  const [documento, setDocumento] = useState('');
  const [cliente, setCliente] = useState<ClienteEncontrado | null>(null);
  const [noExiste, setNoExiste] = useState(false);
  const [crear, setCrear] = useState(false);

  const buscar = useMutation({
    mutationFn: async () =>
      (await api.get<{ existe: boolean; data: ClienteEncontrado | null }>('/clientes-buscar', {
        params: { documento },
      })).data,
    onSuccess: (r) => {
      if (r.existe && r.data) { setCliente(r.data); setNoExiste(false); setCrear(false); }
      else { setCliente(null); setNoExiste(true); }
    },
  });

  const reset = () => { setCliente(null); setNoExiste(false); setCrear(false); };

  // Paso 2b: registrar cliente nuevo, luego continuar con la solicitud
  if (crear) {
    return (
      <div>
        <p className="mb-3 text-sm text-slate-500">
          El documento <b>{documento}</b> no está registrado. Crea el cliente para continuar.
        </p>
        <ClienteForm
          onCreado={() => { setCrear(false); buscar.mutate(); }}
          onCancelar={reset}
        />
      </div>
    );
  }

  // Paso 2a: cliente encontrado → mostrar datos y formulario de crédito
  if (cliente) {
    return (
      <div>
        <div className="card card-pad mb-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-money-700">Cliente encontrado</div>
              <div className="mt-0.5 font-semibold">{cliente.nombres} {cliente.apellidos}</div>
              <div className="text-sm text-slate-500">
                {cliente.tipo_documento} {cliente.numero_documento}
                {cliente.telefono_principal ? ` · ${cliente.telefono_principal}` : ''}
              </div>
              <div className="text-sm text-slate-500">
                {cliente.area ? `Área: ${cliente.area}` : ''}{cliente.cobrador ? ` · Cobrador: ${cliente.cobrador}` : ''}
              </div>
            </div>
            <button onClick={reset} className="btn-ghost btn-sm">Cambiar</button>
          </div>
          {!cliente.activo && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-100">
              Este cliente está inactivo. Actívalo antes de otorgarle un nuevo crédito.
            </p>
          )}
        </div>
        <SolicitudForm clienteId={cliente.id} areaId={cliente.area_id} />
      </div>
    );
  }

  // Paso 1: buscar por documento
  return (
    <div className="max-w-md">
      <label className="block text-sm">
        <span className="mb-1 block text-slate-600">Número de documento del cliente</span>
        <div className="flex gap-2">
          <input
            value={documento}
            onChange={(e) => { setDocumento(e.target.value.replace(/\D/g, '')); setNoExiste(false); }}
            inputMode="numeric"
            placeholder="Ej. 1039876543"
            className="input"
            onKeyDown={(e) => { if (e.key === 'Enter' && documento) buscar.mutate(); }}
          />
          <button onClick={() => buscar.mutate()} disabled={buscar.isPending || !documento}
            className="btn-primary btn-sm whitespace-nowrap">
            {buscar.isPending ? 'Buscando…' : 'Buscar'}
          </button>
        </div>
      </label>

      {noExiste && (
        <div className="mt-3 rounded-xl bg-slate-50 p-4 text-sm ring-1 ring-slate-200">
          <p className="text-slate-600">No hay ningún cliente con el documento <b>{documento}</b>.</p>
          <button onClick={() => setCrear(true)} className="btn-primary btn-sm mt-2">
            Registrar cliente nuevo
          </button>
        </div>
      )}
    </div>
  );
}

import { Icon } from '@/components/ui/icons';
import { useState } from 'react';
import { useClientes } from './hooks';

export function ClientesList({ onNuevo, onVerPerfil }: { onNuevo: () => void; onVerPerfil: (id: number) => void }) {
  const [buscar, setBuscar] = useState('');
  const { data: clientes, isLoading } = useClientes(buscar);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input value={buscar} onChange={(e) => setBuscar(e.target.value)}
          placeholder="Buscar por nombre o documento…"
          className="input flex-1 min-w-[200px]" />
        <button onClick={onNuevo} className="btn-primary btn-sm">
          <Icon.plus /> Nuevo cliente
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">Cargando clientes…</p>
      ) : !clientes || clientes.length === 0 ? (
        <p className="card card-pad border-2 border-dashed border-slate-200 text-center text-sm text-slate-500 shadow-none ring-0">
          No hay clientes todavía. Crea el primero con el botón “Nuevo cliente”.
        </p>
      ) : (
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Documento</th>
                <th className="px-3 py-2">Teléfono</th>
                <th className="px-3 py-2">Área</th>
                <th className="px-3 py-2">Mapa</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id} onClick={() => onVerPerfil(c.id)} className="cursor-pointer border-t hover:bg-slate-50">
                  <td className="px-3 py-2 text-slate-400">{c.id}</td>
                  <td className="px-3 py-2 font-medium">{c.nombres} {c.apellidos}</td>
                  <td className="px-3 py-2">{c.tipo_documento} {c.numero_documento}</td>
                  <td className="px-3 py-2">{c.telefono_principal ?? '—'}</td>
                  <td className="px-3 py-2">{c.area ?? '—'}</td>
                  <td className="px-3 py-2">
                    {c.latitud && c.longitud
                      ? <a onClick={(e) => e.stopPropagation()} className="text-brand underline" target="_blank" rel="noreferrer"
                          href={`https://www.google.com/maps?q=${c.latitud},${c.longitud}`}>Ver</a>
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

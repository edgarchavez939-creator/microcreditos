import { Icon } from '@/components/ui/icons';
import { useState } from 'react';
import { useClientes } from './hooks';
import { EstadoVacio, IconosVacio } from '@/components/ui/EstadoVacio';
import { SkeletonTabla } from '@/components/ui/Skeleton';

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
        <SkeletonTabla filas={6} columnas={4} />
      ) : !clientes || clientes.length === 0 ? (
        buscar
          ? <EstadoVacio icono={IconosVacio.busqueda} titulo="Sin resultados"
              descripcion="Ningún cliente coincide con esa búsqueda. Prueba con otro nombre o documento." />
          : <EstadoVacio icono={IconosVacio.usuarios} titulo="Sin clientes"
              descripcion="Aún no has registrado clientes. Crea el primero con el botón “Nuevo cliente”."
              accion={{ label: 'Nuevo cliente', onClick: onNuevo }} />
      ) : (
        <>
          {/* Escritorio: tabla */}
          <div className="table-wrap hidden sm:block">
            <table className="table-base">
              <thead>
                <tr>
                  <th>#</th><th>Nombre</th><th>Documento</th><th>Teléfono</th><th>Área</th><th>Mapa</th>
                </tr>
              </thead>
              <tbody>
                {clientes.map((c) => (
                  <tr key={c.id} onClick={() => onVerPerfil(c.id)} className="cursor-pointer">
                    <td className="text-content-muted">{c.id}</td>
                    <td className="font-medium">{c.nombres} {c.apellidos}</td>
                    <td>{c.tipo_documento} {c.numero_documento}</td>
                    <td>{c.telefono_principal ?? '—'}</td>
                    <td>{c.area ?? '—'}</td>
                    <td>
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

          {/* Móvil: tarjetas apiladas */}
          <div className="space-y-2.5 sm:hidden">
            {clientes.map((c) => (
              <button key={c.id} onClick={() => onVerPerfil(c.id)}
                className="flex w-full items-center gap-3 rounded-2xl bg-surface p-3.5 text-left
                  ring-1 ring-border-token shadow-[0_1px_2px_rgb(24_28_48/0.04)]
                  transition-transform duration-rapido active:scale-[0.99]">
                {/* Iniciales: da rostro a la lista y ayuda a reconocer al cliente
                    de un vistazo, sin leer el nombre completo. */}
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full
                  bg-estado-info-bg text-sm font-bold text-estado-info">
                  {`${c.nombres?.[0] ?? ''}${c.apellidos?.[0] ?? ''}`.toUpperCase() || '?'}
                </span>
                <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-semibold text-content-strong">{c.nombres} {c.apellidos}</div>
                    <div className="mt-0.5 text-xs text-content-muted">{c.tipo_documento} {c.numero_documento}</div>
                  </div>
                  <span className="shrink-0 rounded-full bg-estado-inactivo-bg px-2 py-0.5 text-[11px] font-medium text-estado-inactivo">{c.area ?? 'Sin área'}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-content-muted">{c.telefono_principal ?? 'Sin teléfono'}</span>
                  {c.latitud && c.longitud && (
                    <a onClick={(e) => e.stopPropagation()} className="font-medium text-estado-info" target="_blank" rel="noreferrer"
                      href={`https://www.google.com/maps?q=${c.latitud},${c.longitud}`}>Ver en mapa</a>
                  )}
                </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

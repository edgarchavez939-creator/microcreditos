import { fecha } from '@/lib/format';
import { useState } from 'react';
import { useActualizarContacto, useClienteDetalle, useHistorialCliente } from './hooks';

const ETIQUETAS: Record<string, string> = {
  correo: 'Correo', telefono_principal: 'Teléfono', direccion: 'Dirección',
};

function fmtFecha(iso: string) {
  try {
    return new Date(iso).toLocaleString('es-CO', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

export function ClienteProfile({ clienteId, onVolver, onEditar }:
  { clienteId: number; onVolver: () => void; onEditar: (c: import('./hooks').ClienteDetalle) => void }) {
  const { data: c, isLoading } = useClienteDetalle(clienteId);
  const { data: historial } = useHistorialCliente(clienteId);
  const actualizar = useActualizarContacto(clienteId);

  const [editando, setEditando] = useState(false);
  const [correo, setCorreo] = useState('');
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abrirEdicion = () => {
    setError(null); setMsg(null);
    setCorreo(c?.correo ?? '');
    setTelefono(c?.telefono_principal ?? '');
    setDireccion(c?.direccion ?? '');
    setEditando(true);
  };

  const guardar = () => {
    setError(null); setMsg(null);
    actualizar.mutate(
      { correo, telefono_principal: telefono, direccion },
      {
        onSuccess: () => { setMsg('Contacto actualizado ✓'); setEditando(false); },
        onError: (e: unknown) => {
          const x = e as { response?: { data?: { message?: string } } };
          setError(x?.response?.data?.message ?? 'No se pudo actualizar el contacto.');
        },
      },
    );
  };

  if (isLoading || !c) return <p className="text-sm text-slate-500">Cargando perfil…</p>;

  return (
    <div className="space-y-5">
      <button onClick={onVolver} className="btn-ghost btn-sm">← Volver a la lista</button>

      <div className="card card-pad">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">{c.nombres} {c.apellidos}</h3>
            <p className="text-sm text-slate-500">{c.tipo_documento} {c.numero_documento}</p>
          </div>
          <div className="flex items-center gap-2">
            {c.cobrador && <span className="rounded-full bg-brand-50 px-3 py-1 text-xs text-brand-700">Cobrador: {c.cobrador}</span>}
            <button onClick={() => onEditar(c)} className="btn-outline btn-sm">Editar datos</button>
          </div>
        </div>

        <div className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Dato label="Área" value={c.area} />
          <Dato label="Estado civil" value={c.estado_civil} />
          <Dato label="Género" value={c.genero} />
          <Dato label="Nacimiento" value={fecha(c.fecha_nacimiento)} />
          <Dato label="Lugar de nacimiento" value={c.lugar_nacimiento} />
          <Dato label="Expedición del documento" value={fecha(c.fecha_expedicion_documento)} />
          <Dato label="Lugar de expedición" value={c.lugar_expedicion_documento} />
          <Dato label="Empresa" value={c.empresa} />
          <Dato label="Cargo" value={c.cargo} />
          <Dato label="Barrio" value={c.barrio} />
          <Dato label="Referencia de ubicación" value={c.referencia_ubicacion} />
        </div>
      </div>

      {/* Contacto (editable) */}
      <div className="card card-pad">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="font-semibold">Información de contacto</h4>
          {!editando && <button onClick={abrirEdicion} className="btn-outline btn-sm">Editar contacto</button>}
        </div>

        {!editando ? (
          <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Dato label="Correo" value={c.correo} />
            <Dato label="Teléfono" value={c.telefono_principal} />
            <Dato label="Dirección" value={c.direccion} />
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="label">Correo</label>
              <input value={correo} onChange={(e) => setCorreo(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Teléfono (7–10 dígitos)</label>
              <input value={telefono} onChange={(e) => setTelefono(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Dirección</label>
              <input value={direccion} onChange={(e) => setDireccion(e.target.value)} className="input" />
            </div>
            <div className="flex gap-2">
              <button onClick={guardar} disabled={actualizar.isPending} className="btn-primary btn-sm">
                {actualizar.isPending ? 'Guardando…' : 'Guardar cambios'}
              </button>
              <button onClick={() => setEditando(false)} className="btn-ghost btn-sm">Cancelar</button>
            </div>
          </div>
        )}
        {msg && <p className="mt-2 text-sm text-green-700">{msg}</p>}
        {error && <p className="mt-2 alert-error">{error}</p>}
      </div>

      {/* Historial de actualizaciones */}
      <div className="card card-pad">
        <h4 className="mb-3 font-semibold">Historial de actualizaciones</h4>
        {!historial || historial.length === 0 ? (
          <p className="text-sm text-slate-500">Aún no hay cambios registrados.</p>
        ) : (
          <ul className="space-y-2">
            {historial.map((h, i) => (
              <li key={i} className="rounded-lg bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-100">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-slate-700">
                    {h.campos.map((k) => ETIQUETAS[k] ?? k).join(', ') || 'Actualización'}
                  </span>
                  <span className="text-xs text-slate-500">{fmtFecha(h.fecha)} · {h.usuario}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Dato({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-50 py-1">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium">{value || '—'}</dd>
    </div>
  );
}

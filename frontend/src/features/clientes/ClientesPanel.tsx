import { useState } from 'react';
import { ClientesList } from './ClientesList';
import { ClienteForm } from './ClienteForm';
import { ClienteProfile } from './ClienteProfile';
import type { ClienteDetalle } from './hooks';

export function ClientesPanel() {
  const [modo, setModo] = useState<'lista' | 'nuevo'>('lista');
  const [perfilId, setPerfilId] = useState<number | null>(null);
  const [editando, setEditando] = useState<ClienteDetalle | null>(null);

  if (editando) {
    return (
      <div>
        <h2 className="page-title">Editar cliente</h2>
        <p className="mb-5 text-sm text-slate-500">
          Todos los campos se pueden modificar, excepto el número de documento.
        </p>
        <ClienteForm
          cliente={editando}
          onCreado={() => setEditando(null)}
          onCancelar={() => setEditando(null)}
        />
      </div>
    );
  }

  return (
    <div>
      <h2 className="page-title">Clientes</h2>
      <p className="mb-5 text-sm text-slate-500">Registra, consulta y actualiza los clientes de tu territorio.</p>

      {perfilId ? (
        <ClienteProfile clienteId={perfilId} onVolver={() => setPerfilId(null)} onEditar={(c) => setEditando(c)} />
      ) : modo === 'lista' ? (
        <ClientesList onNuevo={() => setModo('nuevo')} onVerPerfil={(id) => setPerfilId(id)} />
      ) : (
        <ClienteForm onCreado={() => setModo('lista')} onCancelar={() => setModo('lista')} />
      )}
    </div>
  );
}

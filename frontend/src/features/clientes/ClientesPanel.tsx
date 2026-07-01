import { useState } from 'react';
import { ClientesList } from './ClientesList';
import { ClienteForm } from './ClienteForm';
import { ClienteProfile } from './ClienteProfile';

export function ClientesPanel() {
  const [modo, setModo] = useState<'lista' | 'nuevo'>('lista');
  const [perfilId, setPerfilId] = useState<number | null>(null);

  return (
    <div>
      <h2 className="mb-1 text-xl font-bold">Clientes</h2>
      <p className="mb-5 text-sm text-slate-500">Registra, consulta y actualiza los clientes de tu territorio.</p>

      {perfilId ? (
        <ClienteProfile clienteId={perfilId} onVolver={() => setPerfilId(null)} />
      ) : modo === 'lista' ? (
        <ClientesList onNuevo={() => setModo('nuevo')} onVerPerfil={(id) => setPerfilId(id)} />
      ) : (
        <ClienteForm onCreado={() => setModo('lista')} onCancelar={() => setModo('lista')} />
      )}
    </div>
  );
}

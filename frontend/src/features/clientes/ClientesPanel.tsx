import { useState } from 'react';
import { ClientesList } from './ClientesList';
import { ClienteForm } from './ClienteForm';

export function ClientesPanel() {
  const [modo, setModo] = useState<'lista' | 'nuevo'>('lista');

  return (
    <div>
      <h2 className="mb-1 text-xl font-bold">Clientes</h2>
      <p className="mb-5 text-sm text-slate-500">Registra y consulta los clientes de tu territorio.</p>
      {modo === 'lista'
        ? <ClientesList onNuevo={() => setModo('nuevo')} />
        : <ClienteForm onCreado={() => setModo('lista')} onCancelar={() => setModo('lista')} />}
    </div>
  );
}

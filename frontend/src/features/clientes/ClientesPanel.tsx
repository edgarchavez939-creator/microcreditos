import { useState } from 'react';
import { ClientesList } from './ClientesList';
import { ClienteForm } from './ClienteForm';

export function ClientesPanel() {
  const [modo, setModo] = useState<'lista' | 'nuevo'>('lista');

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">Clientes</h2>
      {modo === 'lista'
        ? <ClientesList onNuevo={() => setModo('nuevo')} />
        : <ClienteForm onCreado={() => setModo('lista')} onCancelar={() => setModo('lista')} />}
    </div>
  );
}

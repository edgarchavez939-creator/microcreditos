import { useState } from 'react';
import { useAuthStore } from '@/stores/auth';
import { SolicitudForm } from '@/features/solicitudes/SolicitudForm';
import { ReamortizacionPanel } from '@/features/renovaciones/ReamortizacionPanel';

type Vista = 'solicitud' | 'reamortizacion';

export function App() {
  const usuario = useAuthStore((s) => s.usuario);
  const logout = useAuthStore((s) => s.logout);
  const [vista, setVista] = useState<Vista>('solicitud');
  const [solicitudId, setSolicitudId] = useState(1);
  const [clienteId, setClienteId] = useState(1);

  if (!usuario) return <LoginScreen />;

  return (
    <div className="min-h-screen bg-white">
      <header className="bg-brand text-white px-4 py-3 flex justify-between items-center">
        <h1 className="font-semibold">Microcréditos</h1>
        <div className="flex items-center gap-3 text-sm">
          <span>{usuario.nombre} · {usuario.rol}</span>
          <button onClick={logout} className="rounded bg-white/15 px-2 py-1 hover:bg-white/25">Salir</button>
        </div>
      </header>

      <nav className="flex gap-1 border-b bg-slate-50 px-4">
        <Tab activo={vista === 'solicitud'} onClick={() => setVista('solicitud')}>Nueva solicitud</Tab>
        <Tab activo={vista === 'reamortizacion'} onClick={() => setVista('reamortizacion')}>Reamortización</Tab>
      </nav>

      <main className="p-4">
        {vista === 'solicitud' ? (
          <>
            <h2 className="text-lg font-semibold mb-4">Nueva solicitud</h2>
            <SolicitudForm clienteId={clienteId} areaId={1} />
          </>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap gap-3 text-sm">
              <label className="flex items-center gap-2">
                Crédito #
                <input type="number" value={solicitudId}
                  onChange={(e) => setSolicitudId(Number(e.target.value))}
                  className="w-24 rounded border px-2 py-1" />
              </label>
              <label className="flex items-center gap-2">
                Cliente #
                <input type="number" value={clienteId}
                  onChange={(e) => setClienteId(Number(e.target.value))}
                  className="w-24 rounded border px-2 py-1" />
              </label>
            </div>
            <ReamortizacionPanel solicitudId={solicitudId} clienteId={clienteId} />
          </>
        )}
      </main>
    </div>
  );
}

function Tab({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
        activo ? 'border-brand text-brand' : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}>
      {children}
    </button>
  );
}

function LoginScreen() {
  const login = useAuthStore((s) => s.login);
  return (
    <div className="min-h-screen grid place-items-center bg-slate-100">
      <button onClick={() => login('admin@empresa.com', 'Admin12345*')}
        className="rounded bg-brand px-6 py-3 text-white">
        Iniciar sesión (demo)
      </button>
    </div>
  );
}

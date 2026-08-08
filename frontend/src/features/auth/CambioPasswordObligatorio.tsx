import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth';
import { Logo } from '@/components/ui/Logo';

/**
 * CAMBIO DE CONTRASEÑA OBLIGATORIO.
 *
 * Se muestra a pantalla completa cuando el usuario aún tiene la contraseña que le
 * asignó otra persona. No hay forma de saltársela: el servidor rechaza cualquier
 * otra operación hasta que se complete.
 *
 * El motivo es la responsabilidad individual: mientras el administrador conozca la
 * clave de un empleado, ninguna acción registrada a nombre de ese empleado prueba
 * realmente que fue él quien la hizo.
 */
export function CambioPasswordObligatorio() {
  const usuario = useAuthStore((s) => s.usuario);
  const logout = useAuthStore((s) => s.logout);
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  const largoOk = nueva.length >= 10;
  const variedadOk = /[A-Za-z]/.test(nueva) && /\d/.test(nueva);
  const coincide = nueva.length > 0 && nueva === confirmacion;
  const distinta = nueva.length > 0 && nueva !== actual;
  const valido = largoOk && variedadOk && coincide && distinta && actual.length > 0;

  const m = useMutation({
    mutationFn: async () => (await api.post('/auth/password', {
      password_actual: actual,
      password_nueva: nueva,
      password_nueva_confirmation: confirmacion,
    })).data,
    onSuccess: () => {
      setListo(true);
      // Recarga completa: a partir de aquí el usuario ya puede operar.
      setTimeout(() => window.location.reload(), 1200);
    },
    onError: (e) => setError(
      (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      ?? 'No se pudo cambiar la contraseña.'
    ),
  });

  const Requisito = ({ ok, texto }: { ok: boolean; texto: string }) => (
    <li className={`flex items-center gap-2 ${ok ? 'text-estado-activo' : 'text-content-muted'}`}>
      <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px]
        ${ok ? 'bg-estado-activo-bg' : 'bg-surface-3'}`}>{ok ? '✓' : '·'}</span>
      {texto}
    </li>
  );

  return (
    <div className="min-h-screen bg-surface-2 px-4 py-10">
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size={48} fondo="claro" className="rounded-2xl" />
          <h1 className="mt-3 font-display text-xl font-bold text-content-strong">
            Crea tu contraseña
          </h1>
          <p className="mt-1 text-sm text-content-muted">
            Hola {usuario?.nombre?.split(' ')[0]}. Antes de entrar, define una contraseña
            que solo tú conozcas.
          </p>
        </div>

        <div className="card card-pad">
          {listo ? (
            <div className="py-6 text-center">
              <div className="mb-2 text-3xl">✓</div>
              <p className="text-sm font-medium text-content-strong">Contraseña actualizada</p>
              <p className="mt-1 text-xs text-content-muted">Entrando…</p>
            </div>
          ) : (
            <>
              {error && <p className="alert-error mb-3">{error}</p>}

              <div className="space-y-3">
                <div>
                  <label className="label">Contraseña actual</label>
                  <input type="password" value={actual} onChange={(e) => setActual(e.target.value)}
                    className="input" autoComplete="current-password" />
                  <p className="mt-1 text-xs text-content-muted">La que te entregaron al crear tu usuario.</p>
                </div>

                <div>
                  <label className="label">Contraseña nueva</label>
                  <input type="password" value={nueva} onChange={(e) => setNueva(e.target.value)}
                    className="input" autoComplete="new-password" />
                </div>

                <div>
                  <label className="label">Repite la contraseña nueva</label>
                  <input type="password" value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)}
                    className="input" autoComplete="new-password" />
                </div>
              </div>

              <ul className="mt-4 space-y-1.5 text-xs">
                <Requisito ok={largoOk} texto="Al menos 10 caracteres" />
                <Requisito ok={variedadOk} texto="Combina letras y números" />
                <Requisito ok={distinta} texto="Distinta de la actual" />
                <Requisito ok={coincide} texto="Las dos coinciden" />
              </ul>

              <button onClick={() => { setError(null); m.mutate(); }}
                disabled={!valido || m.isPending}
                className="btn-primary mt-5 w-full">
                {m.isPending ? 'Guardando…' : 'Guardar y entrar'}
              </button>

              <button onClick={logout}
                className="mt-2 w-full text-xs text-content-muted hover:underline">
                Cerrar sesión
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

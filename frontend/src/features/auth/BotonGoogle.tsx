import { useEffect, useRef, useState } from 'react';

/**
 * BOTÓN "CONTINUAR CON GOOGLE".
 *
 * Usa Google Identity Services: la biblioteca se carga bajo demanda (no lastra el
 * arranque de la app) y devuelve un id_token firmado que el backend valida.
 *
 * Si no hay Client ID configurado, el componente simplemente no se muestra: la
 * aplicación sigue funcionando con el ingreso por contraseña.
 */

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: { client_id: string; callback: (r: { credential: string }) => void }) => void;
          renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
        };
      };
    };
  }
}

const SRC = 'https://accounts.google.com/gsi/client';

function cargarBiblioteca(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();

  const existente = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`);
  if (existente) {
    return new Promise((res, rej) => {
      existente.addEventListener('load', () => res());
      existente.addEventListener('error', () => rej(new Error('carga fallida')));
    });
  }

  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => res();
    s.onerror = () => rej(new Error('carga fallida'));
    document.head.appendChild(s);
  });
}

export function BotonGoogle({ onCredencial, deshabilitado }: {
  onCredencial: (idToken: string) => void;
  deshabilitado?: boolean;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'sin-config' | 'error'>('cargando');

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

  useEffect(() => {
    if (!clientId) { setEstado('sin-config'); return; }

    let vivo = true;
    cargarBiblioteca()
      .then(() => {
        if (!vivo || !contenedor.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (r) => onCredencial(r.credential),
        });
        window.google.accounts.id.renderButton(contenedor.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          locale: 'es',
          width: 320,
        });
        setEstado('listo');
      })
      .catch(() => { if (vivo) setEstado('error'); });

    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  if (estado === 'sin-config') return null;

  return (
    <div className="mt-4">
      <div className="mb-3 flex items-center gap-3 text-xs text-content-muted">
        <span className="h-px flex-1 bg-border-token" />o<span className="h-px flex-1 bg-border-token" />
      </div>

      {estado === 'error' && (
        <p className="text-center text-xs text-content-muted">
          No se pudo cargar el ingreso con Google. Usa tu correo y contraseña.
        </p>
      )}

      <div className={`flex justify-center ${deshabilitado ? 'pointer-events-none opacity-50' : ''}`}>
        <div ref={contenedor} />
      </div>

      {estado === 'cargando' && (
        <p className="text-center text-xs text-content-muted">Cargando…</p>
      )}
    </div>
  );
}

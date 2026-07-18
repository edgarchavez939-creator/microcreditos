import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

interface Props {
  operacion: 'ANULAR_PAGO' | 'ELIMINAR_CREDITO';
  etiqueta: string;                       // texto del botón de confirmación
  onConfirmar: (otp: string) => void;     // se llama con el código digitado
  onCancelar: () => void;
  pendiente?: boolean;
  compacto?: boolean;
}

/**
 * Flujo OTP para operaciones críticas:
 * 1) Generar código (un solo uso, con vigencia limitada; queda auditado).
 * 2) Digitarlo para confirmar la operación.
 */
export function OtpConfirm({ operacion, etiqueta, onConfirmar, onCancelar, pendiente, compacto }: Props) {
  const [otp, setOtp] = useState('');
  const [info, setInfo] = useState<{ codigo: string; vigencia_minutos: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generar = useMutation({
    mutationFn: async () =>
      (await api.post<{ data: { codigo: string; vigencia_minutos: number } }>('/otp/generar', { operacion })).data.data,
    onSuccess: (d) => { setInfo(d); setOtp(''); },
    onError: (e: unknown) => {
      const x = e as { response?: { data?: { message?: string } } };
      setError(x?.response?.data?.message ?? 'No se pudo generar el código.');
    },
  });

  const tam = compacto ? 'text-xs' : 'text-sm';
  const cerrar = () => { setInfo(null); setOtp(''); setError(null); onCancelar(); };

  return (
    <div className={`space-y-2 ${tam}`}>
      {/* Disparador en línea: NO desplaza el contenido; el código aparece flotante */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => { setError(null); generar.mutate(); }} disabled={generar.isPending || !!info}
          className="btn-outline btn-sm">
          {generar.isPending ? 'Generando…' : info ? 'Código enviado' : 'Generar código de seguridad'}
        </button>
        <button onClick={cerrar} className="btn-ghost btn-sm">Cancelar</button>
      </div>
      {error && !info && <p className="text-xs text-rose-600">{error}</p>}

      {/* Panel flotante fijo en la esquina superior derecha (responsivo) */}
      {info && (
        <div className="fixed right-3 top-3 z-[60] w-[min(92vw,320px)] rounded-2xl bg-surface p-4 shadow-lift ring-1 ring-border-token sm:right-4 sm:top-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-ink">Código de seguridad</span>
            <button onClick={cerrar} aria-label="Cerrar" className="text-content-muted hover:text-ink">✕</button>
          </div>
          <div className="rounded-lg bg-surface-2 px-3 py-2 text-sm ring-1 ring-border-token">
            <b className="font-mono text-lg tracking-widest">{info.codigo}</b>
            <div className="mt-0.5 text-xs text-content-muted">un solo uso · vence en {info.vigencia_minutos} min</div>
          </div>
          <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric" placeholder="Digita el código"
            className="input mt-2 w-full py-1.5 font-mono tracking-widest" />
          <div className="mt-2 flex items-center gap-2">
            <button onClick={() => { setError(null); onConfirmar(otp); }}
              disabled={pendiente || otp.length !== 6}
              className="btn btn-sm flex-1 bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50">
              {pendiente ? 'Procesando…' : etiqueta}
            </button>
            <button onClick={() => generar.mutate()} disabled={generar.isPending}
              className="text-xs text-content-muted hover:underline">Nuevo</button>
          </div>
          {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

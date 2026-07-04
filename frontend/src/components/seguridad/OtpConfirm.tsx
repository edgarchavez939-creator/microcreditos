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

  return (
    <div className={`space-y-2 ${tam}`}>
      {!info ? (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => { setError(null); generar.mutate(); }} disabled={generar.isPending}
            className="btn-outline btn-sm">
            {generar.isPending ? 'Generando…' : 'Generar código de seguridad'}
          </button>
          <button onClick={onCancelar} className="btn-ghost btn-sm">Cancelar</button>
        </div>
      ) : (
        <>
          <div className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
            Código: <b className="font-mono text-base tracking-widest">{info.codigo}</b>
            <span className="ml-2 text-slate-400">· un solo uso · vence en {info.vigencia_minutos} min</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric" placeholder="Digita el código"
              className="input max-w-[150px] py-1.5 font-mono tracking-widest" />
            <button onClick={() => { setError(null); onConfirmar(otp); }}
              disabled={pendiente || otp.length !== 6}
              className="btn btn-sm bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50">
              {pendiente ? 'Procesando…' : etiqueta}
            </button>
            <button onClick={() => generar.mutate()} disabled={generar.isPending}
              className="text-xs text-slate-400 hover:underline">Nuevo código</button>
            <button onClick={onCancelar} className="btn-ghost btn-sm">Cancelar</button>
          </div>
        </>
      )}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}

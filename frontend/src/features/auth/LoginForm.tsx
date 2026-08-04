import { Logo } from '@/components/ui/Logo';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BotonGoogle } from './BotonGoogle';
import { useAuthStore } from '@/stores/auth';

const schema = z.object({
  email: z.string().email('Correo inválido'),
  password: z.string().min(1, 'Requerido'),
  otp: z.string().optional(),
});
type Values = z.infer<typeof schema>;

// Cuentas demo (SOLO PARA PRUEBAS — quitar en producción)
const DEMO = [
  { rol: 'Cobrador', email: 'cobrador@empresa.com', password: 'Cobra12345*' },
  { rol: 'Supervisor', email: 'supervisor@empresa.com', password: 'Super12345*' },
  { rol: 'Admin', email: 'admin@empresa.com', password: 'Admin12345*' },
];

export function LoginForm() {
  const login = useAuthStore((s) => s.login);
  const loginGoogle = useAuthStore((s) => s.loginGoogle);
  const [entrandoGoogle, setEntrandoGoogle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [show2fa, setShow2fa] = useState(false);
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } =
    useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: Values) => {
    setError(null);
    try {
      await login(data.email, data.password, data.otp || undefined);
    } catch (e) {
      const err = e as { response?: { status?: number; data?: { message?: string } } };
      const status = err?.response?.status;
      const msg = err?.response?.data?.message ?? '';
      if (status === 429) setError('Demasiados intentos. Espera un minuto e inténtalo de nuevo.');
      else if (status === 423) setError('Cuenta bloqueada temporalmente. Espera unos minutos.');
      else if (msg.toLowerCase().includes('2fa')) { setShow2fa(true); setError('Esta cuenta requiere código 2FA.'); }
      else if (status === 401) setError('Correo o contraseña incorrectos.');
      else setError('No se pudo iniciar sesión. Si el servidor estaba inactivo, espera unos segundos y reintenta.');
    }
  };

  // Ingreso con Google: el mismo destino que el login normal, distinto camino.
  const onGoogle = async (idToken: string) => {
    setError(null);
    setEntrandoGoogle(true);
    try {
      await loginGoogle(idToken);
    } catch (e) {
      const err = e as { response?: { status?: number; data?: { message?: string } } };
      const status = err?.response?.status;
      const msg = err?.response?.data?.message ?? '';
      if (status === 403) setError(msg || 'Esta cuenta de Google no está autorizada. Pide al administrador que la vincule a tu usuario.');
      else if (status === 423) setError('Cuenta bloqueada temporalmente. Espera unos minutos.');
      else if (status === 429) setError('Demasiados intentos. Espera un minuto e inténtalo de nuevo.');
      else if (status === 503) setError(msg || 'El ingreso con Google no está disponible. Usa tu correo y contraseña.');
      else if (msg.toLowerCase().includes('2fa')) setError('Esta cuenta requiere código 2FA: entra con tu correo y contraseña.');
      else setError(msg || 'No se pudo iniciar sesión con Google. Usa tu correo y contraseña.');
    } finally {
      setEntrandoGoogle(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-2 lg:grid lg:grid-cols-2">
      {/* Hero */}
      {/* Gradiente corporativo KRYPTA: profundo → eléctrico → éxito. Es el único
          lugar de la aplicación donde aparece completo, junto al splash. */}
      <div className="relative hidden overflow-hidden bg-krypta lg:flex lg:flex-col lg:justify-between p-12">
        {/* Halos de luz: dan la sensación de flujo del isotipo sin dibujarlo */}
        <div className="absolute -right-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-24 h-[26rem] w-[26rem] rounded-full bg-money-400/15 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <Logo size={44} fondo="oscuro" className="rounded-xl shadow-[0_4px_16px_rgb(0_0_0/0.25)]" />
          <div className="leading-tight">
            <div className="font-display text-dato font-bold tabular-nums tracking-[-0.02em] text-white" data-marca-nombre>KRYPTA</div>
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/60">Business Suite</div>
          </div>
        </div>

        <div className="relative">
          <h1 className="font-display text-[2.75rem] font-extrabold leading-[1.08] tracking-tight text-white">
            El control de tu cartera,<br />
            <span className="text-white/70">en un solo lugar.</span>
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/70">
            Microcrédito, ventas financiadas y cobranza territorial. Desde la solicitud
            hasta el último pago, con trazabilidad completa.
          </p>
          <ul className="mt-9 space-y-2.5 text-sm text-white/75">
            <li className="flex items-center gap-2.5"><Dot /> Roles para cobrador, supervisor y administrador</li>
            <li className="flex items-center gap-2.5"><Dot /> Pagos en cascada y cartera al día</li>
            <li className="flex items-center gap-2.5"><Dot /> Funciona sin conexión en la calle</li>
          </ul>
        </div>

        <div className="relative text-xs text-white/45">Gestión territorial de crédito y cobranza</div>
      </div>

      {/* Formulario */}
      <div className="flex min-h-screen items-center justify-center p-6 lg:min-h-0">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex flex-col items-center lg:hidden">
            <Logo size={56} fondo="claro" className="rounded-2xl shadow-[0_4px_16px_rgb(15_23_42/0.15)]" />
            <h1 className="mt-3 font-display text-dato-lg font-bold tabular-nums tracking-[-0.02em]" data-marca-nombre>KRYPTA</h1>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-content-muted">Business Suite</p>
          </div>

          <div className="card card-pad">
            <h2 className="font-display text-dato-lg font-bold tabular-nums">Inicia sesión</h2>
            <p className="mt-1 text-sm text-content-muted">Ingresa con tu cuenta para continuar.</p>

            <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4">
              <div>
                <label className="label">Correo</label>
                <input type="email" autoComplete="username" {...register('email')} className="input" placeholder="correo@empresa.com" />
                {errors.email && <p className="field-error">{errors.email.message}</p>}
              </div>
              <div>
                <label className="label">Contraseña</label>
                <input type="password" autoComplete="current-password" {...register('password')} className="input" placeholder="••••••••" />
                {errors.password && <p className="field-error">{errors.password.message}</p>}
              </div>
              {show2fa && (
                <div>
                  <label className="label">Código 2FA</label>
                  <input inputMode="numeric" {...register('otp')} className="input" placeholder="123456" />
                </div>
              )}
              {error && <p className="alert-error">{error}</p>}
              <button type="submit" disabled={isSubmitting || entrandoGoogle} className="btn-primary w-full">
                {isSubmitting ? 'Ingresando…' : 'Iniciar sesión'}
              </button>
            </form>

            <BotonGoogle onCredencial={onGoogle} deshabilitado={isSubmitting || entrandoGoogle} />
            {entrandoGoogle && <p className="mt-2 text-center text-xs text-content-muted">Verificando con Google…</p>}

            <div className="mt-6 border-t border-slate-100 pt-4">
              <p className="mb-2 text-xs text-content-muted">Cuentas de prueba (rellenan el formulario):</p>
              <div className="flex gap-2">
                {DEMO.map((d) => (
                  <button key={d.rol} type="button"
                    onClick={() => { setValue('email', d.email); setValue('password', d.password); setError(null); }}
                    className="flex-1 rounded-lg px-2 py-1.5 text-xs font-medium text-content-muted ring-1 ring-border-token hover:bg-surface-2">
                    {d.rol}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Dot() {
  return <span className="grid h-4 w-4 place-items-center rounded-full bg-brand-500/20 text-brand-300">
    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="3"><path d="m5 12 5 5L20 7" /></svg>
  </span>;
}

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '@/stores/auth';

const schema = z.object({
  email: z.string().email('Correo inválido'),
  password: z.string().min(1, 'Requerido'),
  otp: z.string().optional(),
});
type Values = z.infer<typeof schema>;

// Cuentas demo (SOLO PARA PRUEBAS — quitar este bloque en producción)
const DEMO = [
  { rol: 'Cobrador', email: 'cobrador@empresa.com', password: 'Cobra12345*' },
  { rol: 'Supervisor', email: 'supervisor@empresa.com', password: 'Super12345*' },
  { rol: 'Admin', email: 'admin@empresa.com', password: 'Admin12345*' },
];

export function LoginForm() {
  const login = useAuthStore((s) => s.login);
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
      if (status === 429) {
        setError('Demasiados intentos. Espera un minuto e inténtalo de nuevo.');
      } else if (status === 423) {
        setError('Cuenta bloqueada temporalmente por intentos fallidos. Espera unos minutos.');
      } else if (msg.toLowerCase().includes('2fa')) {
        setShow2fa(true);
        setError('Esta cuenta requiere código 2FA. Ingrésalo y vuelve a intentar.');
      } else if (status === 401) {
        setError('Correo o contraseña incorrectos.');
      } else {
        setError('No se pudo iniciar sesión. Si el servidor estaba inactivo, espera unos segundos y reintenta.');
      }
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-slate-100 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col items-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand text-xl font-bold text-white">M</div>
          <h1 className="mt-3 text-lg font-semibold">Microcréditos</h1>
          <p className="text-sm text-slate-500">Inicia sesión para continuar</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Correo</label>
            <input type="email" autoComplete="username" {...register('email')}
              className="mt-1 w-full rounded border px-3 py-2" placeholder="correo@empresa.com" />
            {errors.email && <p className="text-red-600 text-xs">{errors.email.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium">Contraseña</label>
            <input type="password" autoComplete="current-password" {...register('password')}
              className="mt-1 w-full rounded border px-3 py-2" placeholder="••••••••" />
            {errors.password && <p className="text-red-600 text-xs">{errors.password.message}</p>}
          </div>

          {show2fa && (
            <div>
              <label className="block text-sm font-medium">Código 2FA</label>
              <input inputMode="numeric" {...register('otp')}
                className="mt-1 w-full rounded border px-3 py-2" placeholder="123456" />
            </div>
          )}

          {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <button type="submit" disabled={isSubmitting}
            className="w-full rounded bg-brand px-4 py-2 text-white disabled:opacity-50">
            {isSubmitting ? 'Ingresando…' : 'Iniciar sesión'}
          </button>
        </form>

        {/* Acceso rápido de prueba — quitar en producción */}
        <div className="mt-6 border-t pt-4">
          <p className="mb-2 text-xs text-slate-400">Cuentas de prueba (rellenan el formulario):</p>
          <div className="flex gap-2">
            {DEMO.map((d) => (
              <button key={d.rol} type="button"
                onClick={() => { setValue('email', d.email); setValue('password', d.password); setError(null); }}
                className="flex-1 rounded border px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">
                {d.rol}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

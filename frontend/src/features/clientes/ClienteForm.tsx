import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Resolver } from 'react-hook-form';
import { clienteSchema, aPayload, type ClienteFormValues } from './schema';
import { useAreas, useCrearCliente } from './hooks';

export function ClienteForm({ onCreado, onCancelar }: { onCreado?: () => void; onCancelar?: () => void }) {
  const { data: areas } = useAreas();
  const crear = useCrearCliente();
  const [gpsMsg, setGpsMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, setValue, watch, formState: { errors } } =
    useForm<ClienteFormValues>({
      resolver: zodResolver(clienteSchema) as Resolver<ClienteFormValues>,
      defaultValues: { tipo_documento: 'CC' },
    });

  const lat = watch('latitud');
  const lng = watch('longitud');

  const capturarGPS = () => {
    setGpsMsg('Obteniendo ubicación…');
    if (!navigator.geolocation) { setGpsMsg('Este dispositivo no soporta GPS.'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setValue('latitud', Number(pos.coords.latitude.toFixed(7)));
        setValue('longitud', Number(pos.coords.longitude.toFixed(7)));
        setGpsMsg('Ubicación capturada ✓');
      },
      () => setGpsMsg('No se pudo obtener la ubicación (¿permiso denegado?).'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const onSubmit = (v: ClienteFormValues) => {
    setError(null);
    crear.mutate(aPayload(v), {
      onSuccess: () => onCreado?.(),
      onError: (e) => {
        const err = e as { response?: { data?: { message?: string } } };
        setError(err?.response?.data?.message ?? 'No se pudo guardar el cliente.');
      },
    });
  };

  const input = 'mt-1 w-full rounded border px-3 py-2';

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
      <Seccion titulo="Datos personales">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Nombres" error={errors.nombres?.message}>
            <input {...register('nombres')} className={input} />
          </Campo>
          <Campo label="Apellidos" error={errors.apellidos?.message}>
            <input {...register('apellidos')} className={input} />
          </Campo>
          <Campo label="Tipo documento">
            <select {...register('tipo_documento')} className={`${input} bg-white`}>
              <option value="CC">Cédula (CC)</option>
              <option value="CE">Cédula extranjería (CE)</option>
              <option value="TI">Tarjeta identidad (TI)</option>
              <option value="NIT">NIT</option>
              <option value="PASAPORTE">Pasaporte</option>
            </select>
          </Campo>
          <Campo label="Número documento" error={errors.numero_documento?.message}>
            <input {...register('numero_documento')} className={input} />
          </Campo>
          <Campo label="Fecha nacimiento">
            <input type="date" {...register('fecha_nacimiento')} className={input} />
          </Campo>
          <Campo label="Género">
            <select {...register('genero')} className={`${input} bg-white`}>
              <option value="">—</option><option value="M">Masculino</option>
              <option value="F">Femenino</option><option value="OTRO">Otro</option>
            </select>
          </Campo>
          <Campo label="Estado civil">
            <select {...register('estado_civil')} className={`${input} bg-white`}>
              <option value="">—</option><option value="SOLTERO">Soltero</option>
              <option value="CASADO">Casado</option><option value="UNION_LIBRE">Unión libre</option>
              <option value="DIVORCIADO">Divorciado</option><option value="VIUDO">Viudo</option>
            </select>
          </Campo>
        </div>
      </Seccion>

      <Seccion titulo="Contacto">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Teléfono principal"><input {...register('telefono_principal')} className={input} /></Campo>
          <Campo label="Teléfono secundario"><input {...register('telefono_secundario')} className={input} /></Campo>
          <Campo label="Correo" error={errors.correo?.message}><input {...register('correo')} className={input} /></Campo>
        </div>
      </Seccion>

      <Seccion titulo="Ubicación">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Área" error={errors.area_id?.message}>
            <select {...register('area_id', { valueAsNumber: true })} className={`${input} bg-white`}>
              <option value="">Selecciona…</option>
              {areas?.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </Campo>
          <Campo label="Ciudad"><input {...register('ciudad')} className={input} /></Campo>
          <Campo label="Dirección"><input {...register('direccion')} className={input} /></Campo>
          <Campo label="Barrio"><input {...register('barrio')} className={input} /></Campo>
          <div className="sm:col-span-2">
            <Campo label="Referencia de ubicación"><input {...register('referencia_ubicacion')} className={input} /></Campo>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={capturarGPS}
            className="rounded border border-brand px-3 py-1.5 text-sm text-brand hover:bg-brand hover:text-white">
            📍 Capturar GPS
          </button>
          {lat && lng && (
            <a href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noreferrer"
              className="text-sm text-brand underline">Ver en Google Maps ({lat}, {lng})</a>
          )}
          {gpsMsg && <span className="text-xs text-slate-500">{gpsMsg}</span>}
        </div>
      </Seccion>

      <Seccion titulo="Información laboral">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Empresa"><input {...register('empresa')} className={input} /></Campo>
          <Campo label="Cargo"><input {...register('cargo')} className={input} /></Campo>
          <Campo label="Antigüedad (meses)"><input type="number" {...register('antiguedad_meses', { valueAsNumber: true })} className={input} /></Campo>
          <Campo label="Salario"><input type="number" step="any" {...register('salario', { valueAsNumber: true })} className={input} /></Campo>
          <Campo label="Dirección laboral"><input {...register('direccion_laboral')} className={input} /></Campo>
          <Campo label="Teléfono laboral"><input {...register('telefono_laboral')} className={input} /></Campo>
        </div>
      </Seccion>

      <Seccion titulo="Referencias">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Familiar — nombre"><input {...register('ref_familiar_nombre')} className={input} /></Campo>
          <Campo label="Familiar — teléfono"><input {...register('ref_familiar_telefono')} className={input} /></Campo>
          <Campo label="Personal — nombre"><input {...register('ref_personal_nombre')} className={input} /></Campo>
          <Campo label="Personal — teléfono"><input {...register('ref_personal_telefono')} className={input} /></Campo>
        </div>
      </Seccion>

      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex gap-3">
        <button type="submit" disabled={crear.isPending}
          className="rounded bg-brand px-4 py-2 text-white disabled:opacity-50">
          {crear.isPending ? 'Guardando…' : 'Guardar cliente'}
        </button>
        {onCancelar && (
          <button type="button" onClick={onCancelar} className="rounded border px-4 py-2 text-slate-600">
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-slate-700">{titulo}</h3>
      {children}
    </section>
  );
}

function Campo({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {error && <span className="text-red-600 text-xs">{error}</span>}
    </label>
  );
}

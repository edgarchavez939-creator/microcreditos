import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Resolver } from 'react-hook-form';
import { clienteSchema, aPayload, type ClienteFormValues, type SoporteSubido } from './schema';
import { useAreas, useCrearCliente } from './hooks';

const MAX_BYTES = 2 * 1024 * 1024;
const MIME_OK = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

function leerBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] ?? '');
    r.onerror = () => rej(new Error('No se pudo leer el archivo'));
    r.readAsDataURL(file);
  });
}

export function ClienteForm({ onCreado, onCancelar }: { onCreado?: () => void; onCancelar?: () => void }) {
  const { data: areas } = useAreas();
  const crear = useCrearCliente();
  const [gpsMsg, setGpsMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);

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
        setValue('latitud', Number(pos.coords.latitude.toFixed(7)), { shouldValidate: true });
        setValue('longitud', Number(pos.coords.longitude.toFixed(7)), { shouldValidate: true });
        setGpsMsg('Ubicación capturada ✓');
      },
      () => setGpsMsg('No se pudo obtener la ubicación (¿permiso denegado?).'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const errs: string[] = [];
    const nuevos: File[] = [];
    for (const f of Array.from(e.target.files ?? [])) {
      if (!MIME_OK.includes(f.type)) { errs.push(`${f.name}: tipo no permitido`); continue; }
      if (f.size > MAX_BYTES) { errs.push(`${f.name}: supera 2 MB`); continue; }
      nuevos.push(f);
    }
    setArchivos((prev) => [...prev, ...nuevos].slice(0, 6));
    setFileError(errs.join(' · ') || null);
    e.target.value = '';
  };

  const quitarArchivo = (i: number) => setArchivos((prev) => prev.filter((_, idx) => idx !== i));

  const onSubmit = async (v: ClienteFormValues) => {
    setError(null);
    let documentos: SoporteSubido[] = [];
    try {
      documentos = await Promise.all(archivos.map(async (f) => ({
        nombre: f.name, mime: f.type, tamano: f.size, contenido_base64: await leerBase64(f),
      })));
    } catch {
      setError('No se pudieron leer los soportes. Intenta de nuevo.');
      return;
    }
    crear.mutate(aPayload(v, documentos), {
      onSuccess: () => onCreado?.(),
      onError: (e) => {
        const err = e as { response?: { data?: { message?: string } } };
        setError(err?.response?.data?.message ?? 'No se pudo guardar el cliente.');
      },
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
      <Seccion titulo="Datos personales">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Nombres" req error={errors.nombres?.message}><input {...register('nombres')} className="input" /></Campo>
          <Campo label="Apellidos" req error={errors.apellidos?.message}><input {...register('apellidos')} className="input" /></Campo>
          <Campo label="Tipo documento" req>
            <select {...register('tipo_documento')} className="input">
              <option value="CC">Cédula (CC)</option>
              <option value="CE">Cédula extranjería (CE)</option>
              <option value="TI">Tarjeta identidad (TI)</option>
              <option value="NIT">NIT</option>
              <option value="PASAPORTE">Pasaporte</option>
            </select>
          </Campo>
          <Campo label="Número documento" req error={errors.numero_documento?.message}>
            <input inputMode="numeric" {...register('numero_documento')} className="input" />
          </Campo>
          <Campo label="Fecha nacimiento" req error={errors.fecha_nacimiento?.message}>
            <input type="date" {...register('fecha_nacimiento')} className="input" />
          </Campo>
          <Campo label="Género" req error={errors.genero?.message}>
            <select {...register('genero')} className="input">
              <option value="">Selecciona…</option><option value="M">Masculino</option>
              <option value="F">Femenino</option><option value="OTRO">Otro</option>
            </select>
          </Campo>
          <Campo label="Estado civil" req error={errors.estado_civil?.message}>
            <select {...register('estado_civil')} className="input">
              <option value="">Selecciona…</option><option value="SOLTERO">Soltero</option>
              <option value="CASADO">Casado</option><option value="UNION_LIBRE">Unión libre</option>
              <option value="DIVORCIADO">Divorciado</option><option value="VIUDO">Viudo</option>
            </select>
          </Campo>
        </div>
      </Seccion>

      <Seccion titulo="Contacto">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Teléfono principal" req error={errors.telefono_principal?.message}>
            <input inputMode="numeric" {...register('telefono_principal')} className="input" />
          </Campo>
          <Campo label="Correo" req error={errors.correo?.message}>
            <input type="email" {...register('correo')} className="input" />
          </Campo>
        </div>
      </Seccion>

      <Seccion titulo="Ubicación">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Área" req error={errors.area_id?.message}>
            <select {...register('area_id', { valueAsNumber: true })} className="input">
              <option value="">Selecciona…</option>
              {areas?.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </Campo>
          <Campo label="Barrio" req error={errors.barrio?.message}><input {...register('barrio')} className="input" /></Campo>
          <div className="sm:col-span-2">
            <Campo label="Dirección" req error={errors.direccion?.message}><input {...register('direccion')} className="input" /></Campo>
          </div>
          <div className="sm:col-span-2">
            <Campo label="Referencia de ubicación" req error={errors.referencia_ubicacion?.message}>
              <input {...register('referencia_ubicacion')} className="input" />
            </Campo>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={capturarGPS} className="btn-outline btn-sm text-brand ring-brand-200 hover:bg-brand-50">
            📍 Capturar GPS
          </button>
          {lat && lng ? (
            <a href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noreferrer" className="text-sm text-brand underline">
              Ver en Google Maps ({lat}, {lng})
            </a>
          ) : null}
          {gpsMsg && <span className="text-xs text-slate-500">{gpsMsg}</span>}
        </div>
        {(errors.latitud || errors.longitud) && <p className="field-error">Captura la ubicación GPS del cliente.</p>}
      </Seccion>

      <Seccion titulo="Información laboral">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Empresa" req error={errors.empresa?.message}><input {...register('empresa')} className="input" /></Campo>
          <Campo label="Cargo" req error={errors.cargo?.message}><input {...register('cargo')} className="input" /></Campo>
          <Campo label="Antigüedad (meses)" req error={errors.antiguedad_meses?.message}>
            <input type="number" {...register('antiguedad_meses', { valueAsNumber: true })} className="input" />
          </Campo>
          <Campo label="Salario" req error={errors.salario?.message}>
            <input type="number" step="any" {...register('salario', { valueAsNumber: true })} className="input" />
          </Campo>
          <div className="sm:col-span-2">
            <Campo label="Dirección laboral" req error={errors.direccion_laboral?.message}><input {...register('direccion_laboral')} className="input" /></Campo>
          </div>
        </div>
      </Seccion>

      <Seccion titulo="Soportes (opcional)">
        <p className="mb-2 text-xs text-slate-500">Imágenes (JPG, PNG, WEBP) o PDF. Máximo 2 MB por archivo.</p>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium text-brand ring-1 ring-brand-200 hover:bg-brand-50">
          Añadir archivos
          <input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={onFiles} className="hidden" />
        </label>
        {fileError && <p className="field-error">{fileError}</p>}
        {archivos.length > 0 && (
          <ul className="mt-3 space-y-2">
            {archivos.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-100">
                <span className="truncate">{f.name} <span className="text-slate-400">· {(f.size / 1024).toFixed(0)} KB</span></span>
                <button type="button" onClick={() => quitarArchivo(i)} className="text-rose-600 hover:underline">Quitar</button>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <Seccion titulo="Referencias (opcional)">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Familiar — nombre"><input {...register('ref_familiar_nombre')} className="input" /></Campo>
          <Campo label="Familiar — teléfono"><input {...register('ref_familiar_telefono')} className="input" /></Campo>
          <Campo label="Personal — nombre"><input {...register('ref_personal_nombre')} className="input" /></Campo>
          <Campo label="Personal — teléfono"><input {...register('ref_personal_telefono')} className="input" /></Campo>
        </div>
      </Seccion>

      {error && <p className="alert-error">{error}</p>}

      <div className="flex gap-3">
        <button type="submit" disabled={crear.isPending} className="btn-primary">
          {crear.isPending ? 'Guardando…' : 'Guardar cliente'}
        </button>
        {onCancelar && <button type="button" onClick={onCancelar} className="btn-outline">Cancelar</button>}
      </div>
    </form>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="card card-pad">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">{titulo}</h3>
      {children}
    </section>
  );
}

function Campo({ label, req, error, children }: { label: string; req?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}{req && <span className="text-rose-500"> *</span>}</span>
      {children}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

import { z } from 'zod';
import { esMunicipioValido } from '@/lib/municipios';

const soloDigitos = (min: number, max: number, msg: string) =>
  z.string().regex(new RegExp(`^[0-9]{${min},${max}}$`), msg);

export const clienteSchema = z.object({
  // Personales (obligatorios)
  nombres: z.string().min(1, 'Requerido'),
  apellidos: z.string().min(1, 'Requerido'),
  tipo_documento: z.enum(['CC', 'CE', 'TI', 'NIT', 'PASAPORTE']),
  numero_documento: soloDigitos(4, 40, 'Solo números'),
  fecha_nacimiento: z.string().min(1, 'Requerido'),
  fecha_expedicion_documento: z.string().min(1, 'Requerido'),
  lugar_expedicion_documento: z.string().min(1, 'Requerido')
    .refine(esMunicipioValido, 'Selecciona un municipio del listado'),
  lugar_nacimiento: z.string().min(1, 'Requerido')
    .refine(esMunicipioValido, 'Selecciona un municipio del listado'),
  genero: z.enum(['M', 'F', 'OTRO'], { message: 'Requerido' }),
  estado_civil: z.enum(['SOLTERO', 'CASADO', 'UNION_LIBRE', 'DIVORCIADO', 'VIUDO'], { message: 'Requerido' }),
  // Contacto (obligatorios)
  telefono_principal: soloDigitos(7, 10, '7 a 10 dígitos'),
  correo: z.string().min(1, 'Requerido').email('Correo inválido'),
  // Ubicación (obligatorios)
  area_id: z.number().int().positive('Selecciona un área'),
  cobrador_id: z.number().int().positive().optional(),
  direccion: z.string().min(1, 'Requerido'),
  barrio: z.string().min(1, 'Requerido'),
  referencia_ubicacion: z.string().min(1, 'Requerido'),
  latitud: z.number({ message: 'Captura el GPS' }),
  longitud: z.number({ message: 'Captura el GPS' }),
  // Laboral (obligatorios)
  empresa: z.string().min(1, 'Requerido'),
  cargo: z.string().min(1, 'Requerido'),
  antiguedad_meses: z.number({ message: 'Requerido' }).int().min(0),
  salario: z.number({ message: 'Requerido' }).min(0),
  direccion_laboral: z.string().min(1, 'Requerido'),
  // Referencias (opcionales)
  ref_familiar_nombre: z.string().optional(),
  ref_familiar_telefono: z.string().optional(),
  ref_personal_nombre: z.string().optional(),
  ref_personal_telefono: z.string().optional(),
});

export type ClienteFormValues = z.infer<typeof clienteSchema>;

export interface SoporteSubido {
  nombre: string;
  mime: string;
  tamano: number;
  contenido_base64: string;
}

/** Convierte los campos planos al payload del backend (referencias + soportes). */
export function aPayload(v: ClienteFormValues, documentos: SoporteSubido[]) {
  const referencias: Array<{ tipo: string; nombre: string; telefono?: string }> = [];
  if (v.ref_familiar_nombre) referencias.push({ tipo: 'FAMILIAR', nombre: v.ref_familiar_nombre, telefono: v.ref_familiar_telefono });
  if (v.ref_personal_nombre) referencias.push({ tipo: 'PERSONAL', nombre: v.ref_personal_nombre, telefono: v.ref_personal_telefono });

  const {
    ref_familiar_nombre, ref_familiar_telefono, ref_personal_nombre, ref_personal_telefono, ...resto
  } = v;

  return { ...resto, referencias, documentos };
}

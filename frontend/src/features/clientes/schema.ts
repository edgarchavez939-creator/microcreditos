import { z } from 'zod';

export const clienteSchema = z.object({
  // Personales
  nombres: z.string().min(1, 'Requerido'),
  apellidos: z.string().min(1, 'Requerido'),
  tipo_documento: z.enum(['CC', 'CE', 'TI', 'NIT', 'PASAPORTE']),
  numero_documento: z.string().min(1, 'Requerido'),
  fecha_nacimiento: z.string().optional(),
  genero: z.enum(['M', 'F', 'OTRO']).optional(),
  estado_civil: z.enum(['SOLTERO', 'CASADO', 'UNION_LIBRE', 'DIVORCIADO', 'VIUDO']).optional(),
  // Contacto
  telefono_principal: z.string().optional(),
  telefono_secundario: z.string().optional(),
  correo: z.string().email('Correo inválido').optional().or(z.literal('')),
  // Ubicación
  area_id: z.number().int().positive('Selecciona un área'),
  direccion: z.string().optional(),
  barrio: z.string().optional(),
  ciudad: z.string().optional(),
  referencia_ubicacion: z.string().optional(),
  latitud: z.number().optional(),
  longitud: z.number().optional(),
  // Laboral
  empresa: z.string().optional(),
  cargo: z.string().optional(),
  antiguedad_meses: z.number().int().min(0).optional(),
  salario: z.number().min(0).optional(),
  direccion_laboral: z.string().optional(),
  telefono_laboral: z.string().optional(),
  // Referencias
  ref_familiar_nombre: z.string().optional(),
  ref_familiar_telefono: z.string().optional(),
  ref_personal_nombre: z.string().optional(),
  ref_personal_telefono: z.string().optional(),
});

export type ClienteFormValues = z.infer<typeof clienteSchema>;

/** Convierte los campos planos del form al payload del backend (con array de referencias). */
export function aPayload(v: ClienteFormValues) {
  const referencias: Array<{ tipo: string; nombre: string; telefono?: string }> = [];
  if (v.ref_familiar_nombre) referencias.push({ tipo: 'FAMILIAR', nombre: v.ref_familiar_nombre, telefono: v.ref_familiar_telefono });
  if (v.ref_personal_nombre) referencias.push({ tipo: 'PERSONAL', nombre: v.ref_personal_nombre, telefono: v.ref_personal_telefono });

  const {
    ref_familiar_nombre, ref_familiar_telefono, ref_personal_nombre, ref_personal_telefono,
    correo, ...resto
  } = v;

  return { ...resto, correo: correo || undefined, referencias };
}

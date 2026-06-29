import { z } from 'zod';

export const solicitudSchema = z
  .object({
    cliente_id: z.number().int().positive(),
    area_id: z.number().int().positive(),
    capital_solicitado: z.number().positive(),
    monto_aprobado: z.number().positive(),
    // Porcentajes (5 = 5%), se convierten a decimal al enviar
    tasa_interes: z.number().min(0).max(100),
    modalidad: z.enum(['DIARIO', 'SEMANAL', 'QUINCENAL', 'MENSUAL']),
    numero_cuotas: z.number().int().min(1),
    fecha_primer_pago: z.string().optional(),
    seguro_exonerado: z.boolean().default(false),
    porcentaje_seguro: z.number().min(0).max(100),
    motivo_exoneracion: z.string().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.seguro_exonerado) {
      if (!d.motivo_exoneracion || d.motivo_exoneracion.length < 5) {
        ctx.addIssue({ code: 'custom', path: ['motivo_exoneracion'],
          message: 'La exoneración requiere un motivo (mín. 5 caracteres).' });
      }
    } else if (d.porcentaje_seguro < 5 || d.porcentaje_seguro > 10) {
      ctx.addIssue({ code: 'custom', path: ['porcentaje_seguro'],
        message: 'El seguro debe estar entre 5% y 10%.' });
    }
  });

export type SolicitudForm = z.infer<typeof solicitudSchema>;

/** Cálculo en cliente espejo del backend. Las tasas entran como porcentaje. */
export function calcularPreview(d: Partial<SolicitudForm>) {
  const aprobado = d.monto_aprobado ?? 0;
  const pct = (d.seguro_exonerado ? 0 : d.porcentaje_seguro ?? 0) / 100;
  const tasa = (d.tasa_interes ?? 0) / 100;
  const valorSeguro = Math.round(aprobado * pct * 100) / 100;
  const desembolsado = Math.round((aprobado - valorSeguro) * 100) / 100;
  const interes = Math.round(aprobado * tasa * (d.numero_cuotas ?? 1) * 100) / 100;
  const totalRecaudar = Math.round((aprobado + interes) * 100) / 100;
  const cuota = d.numero_cuotas ? Math.round((totalRecaudar / d.numero_cuotas) * 100) / 100 : 0;
  return { valorSeguro, desembolsado, interes, totalRecaudar, cuota };
}

/** Convierte porcentajes a decimales para el backend. */
export function aPayloadSolicitud(d: SolicitudForm) {
  return {
    ...d,
    tasa_interes: Math.round((d.tasa_interes / 100) * 1e6) / 1e6,
    porcentaje_seguro: Math.round((d.porcentaje_seguro / 100) * 1e6) / 1e6,
  };
}

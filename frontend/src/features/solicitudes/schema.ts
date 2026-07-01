import { z } from 'zod';

// Cuotas por mes según modalidad
export const PERIODOS_POR_MES: Record<string, number> = {
  MENSUAL: 1, QUINCENAL: 2, SEMANAL: 4, DIARIO: 30,
};

export const solicitudSchema = z
  .object({
    cliente_id: z.number().int().positive(),
    area_id: z.number().int().positive().optional(),
    capital_solicitado: z.number().positive(),
    monto_aprobado: z.number().positive(),
    tasa_interes: z.number().min(0).max(100),          // porcentaje mensual
    modalidad: z.enum(['DIARIO', 'SEMANAL', 'QUINCENAL', 'MENSUAL']),
    plazo_meses: z.number().int().min(1).max(60),
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

/** Simulación del plan: nº de cuotas y valor por modalidad + plazo. */
export function calcularPreview(d: Partial<SolicitudForm>) {
  const aprobado = d.monto_aprobado ?? 0;
  const plazo = d.plazo_meses ?? 0;
  const factor = PERIODOS_POR_MES[d.modalidad ?? 'MENSUAL'] ?? 1;
  const numeroCuotas = plazo * factor;
  const pct = (d.seguro_exonerado ? 0 : d.porcentaje_seguro ?? 0) / 100;
  const tasa = (d.tasa_interes ?? 0) / 100;
  const valorSeguro = Math.round(aprobado * pct * 100) / 100;
  const desembolsado = Math.round((aprobado - valorSeguro) * 100) / 100;
  const interes = Math.round(aprobado * tasa * plazo * 100) / 100;
  const totalRecaudar = Math.round((aprobado + interes) * 100) / 100;
  const cuota = numeroCuotas ? Math.round((totalRecaudar / numeroCuotas) * 100) / 100 : 0;
  return { valorSeguro, desembolsado, interes, totalRecaudar, cuota, numeroCuotas };
}

/** Payload para el backend: plazo en meses + tasas en decimal. */
export function aPayloadSolicitud(d: SolicitudForm) {
  return {
    ...d,
    tasa_interes: Math.round((d.tasa_interes / 100) * 1e6) / 1e6,
    porcentaje_seguro: Math.round((d.porcentaje_seguro / 100) * 1e6) / 1e6,
  };
}

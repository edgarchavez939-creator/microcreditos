import { z } from 'zod';

export interface ReamortizacionFormValues {
  nuevo_capital: number;
  tasa_mensual: number;
  plazo_meses: number;
  modalidad: 'DIARIO' | 'SEMANAL' | 'QUINCENAL' | 'MENSUAL';
  seguro_exonerado: boolean;
  porcentaje_seguro: number;
  motivo_exoneracion?: string;
  fecha_primer_pago?: string;
}

/** Crea el schema con las reglas que dependen del saldo y el cupo vigentes. */
export function makeReamortizacionSchema(saldo: number, cupo: number) {
  return z
    .object({
      nuevo_capital: z.number({ invalid_type_error: 'Requerido' }).positive('Debe ser mayor a 0'),
      tasa_mensual: z.number({ invalid_type_error: 'Requerido' }).min(0, 'Mínimo 0%').max(100, 'Máximo 100%'),
      plazo_meses: z.number({ invalid_type_error: 'Requerido' }).int().min(1),
      modalidad: z.enum(['DIARIO', 'SEMANAL', 'QUINCENAL', 'MENSUAL']),
      seguro_exonerado: z.boolean(),
      porcentaje_seguro: z.number().min(0).max(100),
      motivo_exoneracion: z.string().optional(),
      fecha_primer_pago: z.string().optional(),
    })
    .superRefine((d, ctx) => {
      if (d.nuevo_capital < saldo) {
        ctx.addIssue({
          code: 'custom', path: ['nuevo_capital'],
          message: `No puede ser inferior al saldo pendiente (${saldo.toLocaleString('es-CO')}).`,
        });
      }
      if (cupo > 0 && d.nuevo_capital > cupo) {
        ctx.addIssue({
          code: 'custom', path: ['nuevo_capital'],
          message: `Supera el cupo disponible (${cupo.toLocaleString('es-CO')}).`,
        });
      }
      if (d.seguro_exonerado) {
        if (!d.motivo_exoneracion || d.motivo_exoneracion.length < 5) {
          ctx.addIssue({ code: 'custom', path: ['motivo_exoneracion'],
            message: 'La exoneración requiere un motivo (mín. 5 caracteres).' });
        }
      } else if (d.porcentaje_seguro > 0 && (d.porcentaje_seguro < 0.05 || d.porcentaje_seguro > 0.1)) {
        ctx.addIssue({ code: 'custom', path: ['porcentaje_seguro'],
          message: 'El seguro debe estar entre 5% y 10%.' });
      }
    });
}

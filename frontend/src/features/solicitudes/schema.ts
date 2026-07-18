import { z } from 'zod';

// Cuotas por mes según modalidad
export const PERIODOS_POR_MES: Record<string, number> = {
  MENSUAL: 1, QUINCENAL: 2, SEMANAL: 4, DIARIO: 30,
};

/** Configuración de un producto financiero (viene del motor de productos del backend). */
export interface ProductoFinanciero {
  id: number;
  codigo: string;
  nombre: string;
  descripcion?: string | null;
  activo: boolean;
  color?: string | null;
  orden: number;
  version_actual: number;
  usa_tasa: boolean;
  tasa_defecto: number | string;
  permite_modificar_tasa: boolean;
  usa_seguro: boolean;
  seguro_defecto: number | string;
  permite_modificar_seguro: boolean;
  usa_valor_pactado: boolean;
  permite_renovacion: boolean;
  requiere_supervisor: boolean;
  requiere_administrador: boolean;
  aprobacion_automatica: boolean;
  permite_desembolso_efectivo: boolean;
  permite_desembolso_transferencia: boolean;
  capital_minimo: number | string;
  capital_maximo: number | string;
  cuotas_minimo: number;
  cuotas_maximo: number;
  frecuencias_permitidas: string[] | string;
}

/** Frecuencias del producto normalizadas (el backend puede enviarlas como JSON string). */
export function frecuenciasDe(p?: ProductoFinanciero | null): string[] {
  if (!p) return ['DIARIO', 'SEMANAL', 'QUINCENAL', 'MENSUAL'];
  const f = typeof p.frecuencias_permitidas === 'string'
    ? (JSON.parse(p.frecuencias_permitidas || '[]') as string[])
    : p.frecuencias_permitidas;
  return f?.length ? f : ['DIARIO', 'SEMANAL', 'QUINCENAL', 'MENSUAL'];
}

export const solicitudSchema = z
  .object({
    cliente_id: z.number().int().positive(),
    area_id: z.number().int().positive().optional(),
    producto_financiero_id: z.number().int().positive().optional(),
    capital_solicitado: z.number().positive(),
    valor_pactado: z.number().positive().optional(),
    tasa_interes: z.number().min(0).max(100).optional(),   // porcentaje mensual (si el producto usa tasa)
    modalidad: z.enum(['DIARIO', 'SEMANAL', 'QUINCENAL', 'MENSUAL']),
    plazo_meses: z.number().int().min(1).max(60),
    fecha_primer_pago: z.string().optional(),
    seguro_exonerado: z.boolean().default(false),
    porcentaje_seguro: z.number().min(0).max(100).optional(),
    motivo_exoneracion: z.string().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.seguro_exonerado) {
      if (!d.motivo_exoneracion || d.motivo_exoneracion.length < 5) {
        ctx.addIssue({ code: 'custom', path: ['motivo_exoneracion'],
          message: 'La exoneración requiere un motivo (mín. 5 caracteres).' });
      }
    }
  });

export type SolicitudForm = z.infer<typeof solicitudSchema>;

/**
 * Simulación estimada del plan según la CONFIGURACIÓN del producto (motor de productos).
 * - Producto con tasa: interés = capital × tasa × plazo (fórmula existente).
 * - Producto de valor pactado (Al Bate): total = pactado; cuota = pactado ÷ cuotas.
 * Se basa en el capital SOLICITADO (el monto real lo fija el aprobador).
 */
export function calcularPreview(d: Partial<SolicitudForm>, producto?: ProductoFinanciero | null) {
  const base = d.capital_solicitado ?? 0;
  const plazo = d.plazo_meses ?? 0;
  const factor = PERIODOS_POR_MES[d.modalidad ?? 'MENSUAL'] ?? 1;
  const numeroCuotas = plazo * factor;

  const usaSeguro = producto ? producto.usa_seguro : true;
  const usaTasa = producto ? producto.usa_tasa : true;
  const usaPactado = producto ? producto.usa_valor_pactado : false;

  const pct = (!usaSeguro || d.seguro_exonerado ? 0 : d.porcentaje_seguro ?? 0) / 100;
  const valorSeguro = Math.round(base * pct * 100) / 100;
  const desembolsado = Math.round((base - valorSeguro) * 100) / 100;

  let interes = 0;
  let totalRecaudar = 0;
  if (usaPactado) {
    const pactado = d.valor_pactado ?? 0;
    totalRecaudar = Math.round(pactado * 100) / 100;
    interes = Math.round((pactado - base) * 100) / 100;
  } else {
    const tasa = (usaTasa ? d.tasa_interes ?? 0 : 0) / 100;
    interes = Math.round(base * tasa * plazo * 100) / 100;
    totalRecaudar = Math.round((base + interes) * 100) / 100;
  }
  const cuota = numeroCuotas ? Math.round((totalRecaudar / numeroCuotas) * 100) / 100 : 0;
  return { valorSeguro, desembolsado, interes, totalRecaudar, cuota, numeroCuotas };
}

/** Convierte el formulario al payload del backend (porcentajes UI → decimales). */
export function aPayloadSolicitud(d: SolicitudForm) {
  return {
    cliente_id: d.cliente_id,
    producto_financiero_id: d.producto_financiero_id,
    capital_solicitado: d.capital_solicitado,
    valor_pactado: d.valor_pactado,
    tasa_interes: d.tasa_interes != null ? d.tasa_interes / 100 : undefined,
    modalidad: d.modalidad,
    plazo_meses: d.plazo_meses,
    fecha_primer_pago: d.fecha_primer_pago || undefined,
    seguro_exonerado: d.seguro_exonerado,
    porcentaje_seguro: d.seguro_exonerado ? 0 : (d.porcentaje_seguro != null ? d.porcentaje_seguro / 100 : undefined),
    motivo_exoneracion: d.motivo_exoneracion || undefined,
  };
}

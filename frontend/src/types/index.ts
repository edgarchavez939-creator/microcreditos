export type Rol = 'ADMINISTRADOR' | 'SUPERVISOR' | 'COBRADOR';

export interface Usuario {
  id: number; uuid: string; nombre: string; email: string;
  rol: Rol; twofa_enabled: boolean; areas?: string[];
}

export type EstadoSolicitud =
  | 'BORRADOR' | 'PENDIENTE_SUPERVISOR' | 'PENDIENTE_ADMINISTRADOR'
  | 'APROBADO' | 'RECHAZADO' | 'DESEMBOLSADO' | 'ACTIVO' | 'FINALIZADO' | 'CASTIGADO'
  | 'PAGADO' | 'EN_MORA' | 'REAMORTIZADO' | 'REFINANCIADO' | 'CANCELADO';

export interface Solicitud {
  id: number; uuid: string; cliente_id: number; estado: EstadoSolicitud;
  capital_solicitado: number; monto_aprobado: number; tasa_interes: number;
  interes: number; porcentaje_seguro: number; valor_seguro: number;
  monto_desembolsado: number; total_recaudar: number; seguro_exonerado: boolean;
  motivo_exoneracion: string | null;
  modalidad: 'DIARIO' | 'SEMANAL' | 'QUINCENAL' | 'MENSUAL';
  numero_cuotas: number; valor_cuota: number;
  plazo_meses?: number | null;
  credito_origen_id?: number | null;
  saldo_refinanciado?: number;
  total_pagado?: number;
  saldo_pendiente?: number;
}

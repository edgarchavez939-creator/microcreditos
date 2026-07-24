export type Rol = 'ADMINISTRADOR' | 'SUPERVISOR' | 'COBRADOR' | 'ADMIN_FUNCIONAL';

export interface Usuario {
  id: number; uuid: string; nombre: string; email: string;
  rol: Rol; twofa_enabled: boolean; areas?: string[];
}

export type EstadoSolicitud =
  | 'BORRADOR' | 'PENDIENTE_SUPERVISOR' | 'PENDIENTE_ADMINISTRADOR'
  | 'APROBADO' | 'RECHAZADO' | 'DESEMBOLSADO' | 'ACTIVO' | 'MIGRADO' | 'FINALIZADO' | 'CASTIGADO'
  | 'PAGADO' | 'EN_MORA' | 'REAMORTIZADO' | 'REFINANCIADO' | 'CANCELADO';

export interface Cuota {
  numero_cuota: number;
  fecha_vencimiento: string;
  valor: number;
  abono_capital?: number;
  abono_interes?: number;
  valor_pagado: number;
  saldo: number;
  estado: 'PENDIENTE' | 'PARCIAL' | 'PAGADA' | 'VENCIDA';
  dias_mora?: number;
}

export interface Pago {
  id: number;
  fecha: string;
  hora?: string;
  valor: number;
  metodo: string;
  observaciones?: string | null;
  registrado_por?: string;
}

export interface Solicitud {
  id: number; uuid: string; numero_credito?: string; cliente_id: number; cliente?: string; cliente_telefono?: string; cliente_salario?: number | null; credito_origen?: string; estado: EstadoSolicitud;
  capital_solicitado: number; monto_aprobado: number | null; tasa_interes: number;
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
  cuotas?: Cuota[];
  pagos?: Pago[];
}

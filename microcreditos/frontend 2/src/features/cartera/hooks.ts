import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Solicitud } from '@/types';

// Créditos sobre los que se puede operar (desembolsar o pagar)
const OPERABLES = 'APROBADO,DESEMBOLSADO,ACTIVO,EN_MORA';

export function useCreditos(buscar = '') {
  return useQuery({
    queryKey: ['cartera', buscar],
    queryFn: async () =>
      (await api.get<{ data: Solicitud[] }>('/solicitudes', { params: { estado: OPERABLES, buscar } })).data.data,
  });
}

export function useCreditoDetalle(id: number | null) {
  return useQuery({
    queryKey: ['credito', id],
    queryFn: async () => (await api.get<{ data: Solicitud }>(`/solicitudes/${id}`)).data.data,
    enabled: !!id,
  });
}

export function useDesembolsar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, metodo, fecha }: { id: number; metodo: string; fecha: string }) =>
      (await api.post(`/solicitudes/${id}/desembolsar`, { metodo, fecha })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cartera'] }),
  });
}

export function useGenerarCronograma() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await api.post(`/solicitudes/${id}/cronograma`)).data,
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ['credito', id] });
      qc.invalidateQueries({ queryKey: ['credito-cuotas', id] });
      qc.invalidateQueries({ queryKey: ['cartera'] });
    },
  });
}

export function useEliminarCredito() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, otp }: { id: number; otp: string }) =>
      (await api.delete(`/solicitudes/${id}`, { data: { otp } })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cartera'] }),
  });
}

export function useRegistrarPago() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      solicitud_id: number; valor: number; metodo: string; observaciones?: string; client_uuid: string;
      banco?: string; referencia?: string;
      comprobante?: { nombre: string; mime: string; tamano: number; contenido_base64: string };
    }) => (await api.post('/pagos', payload)).data,
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['cartera'] });
      qc.invalidateQueries({ queryKey: ['credito', vars.solicitud_id] });
    },
  });
}

export interface EventoCredito {
  fecha: string; tipo: string; titulo: string; detalle?: string; usuario?: string | null;
}

export function useEventosCredito(id: number | null, activo: boolean) {
  return useQuery({
    queryKey: ['credito-eventos', id],
    queryFn: async () => (await api.get<{ data: EventoCredito[] }>(`/solicitudes/${id}/eventos`)).data.data,
    enabled: !!id && activo,
  });
}

export interface CuotaFila {
  id: number; numero_cuota: number; fecha_vencimiento: string; valor: number;
  abono_capital: number; abono_interes: number; valor_pagado: number; saldo: number; estado: string;
}

export interface PagoFila {
  id: number; fecha: string; hora?: string | null; valor: number;
  metodo: string; observaciones?: string | null; registrado_por?: string | null;
  aplicado?: boolean;
}

/** Cuotas por endpoint dedicado (consulta directa, inmune a cachés). */
export function useCuotasCredito(id: number | null) {
  return useQuery({
    queryKey: ['credito-cuotas', id],
    queryFn: async () =>
      (await api.get<{ data: CuotaFila[]; pagos: PagoFila[]; total: number }>(`/solicitudes/${id}/cuotas`)).data,
    enabled: !!id,
    staleTime: 0,
    gcTime: 0,
  });
}

export function useAnularPago() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, otp }: { id: number; otp: string; creditoId: number }) =>
      (await api.delete(`/pagos/${id}`, { data: { otp } })).data,
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['credito', v.creditoId] });
      qc.invalidateQueries({ queryKey: ['credito-cuotas', v.creditoId] });
      qc.invalidateQueries({ queryKey: ['cartera'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['caja-resumen'] });
    },
  });
}

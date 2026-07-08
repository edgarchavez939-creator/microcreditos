import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Solicitud } from '@/types';

interface ReamortizarPayload {
  nuevo_capital: number;
  tasa_mensual: number;
  plazo_meses: number;
  porcentaje_seguro?: number;
  seguro_exonerado?: boolean;
  motivo_exoneracion?: string;
  modalidad?: 'DIARIO' | 'SEMANAL' | 'QUINCENAL' | 'MENSUAL';
  fecha_primer_pago?: string;
}

export function useSaldoPendiente(solicitudId: number) {
  return useQuery({
    queryKey: ['saldo', solicitudId],
    queryFn: async () => (await api.get(`/solicitudes/${solicitudId}/saldo`)).data.data,
  });
}

export function useReamortizar(solicitudId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ReamortizarPayload) =>
      (await api.post(`/solicitudes/${solicitudId}/reamortizar`, payload)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['solicitudes'] });
      qc.invalidateQueries({ queryKey: ['historial', solicitudId] });
    },
  });
}

export function useHistorialCredito(solicitudId: number) {
  return useQuery({
    queryKey: ['historial', solicitudId],
    queryFn: async () =>
      (await api.get<{ data: Solicitud[] }>(`/solicitudes/${solicitudId}/historial`)).data.data,
  });
}


export function useCupoCliente(clienteId: number) {
  return useQuery({
    queryKey: ['cupo', clienteId],
    queryFn: async () =>
      (await api.get<{ data: { cupo_inicial: number; cupo_disponible: number } }>(
        `/clientes/${clienteId}/cupo`,
      )).data.data,
  });
}

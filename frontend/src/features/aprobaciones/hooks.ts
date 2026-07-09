import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Solicitud } from '@/types';

const PENDIENTES = 'PENDIENTE_SUPERVISOR,PENDIENTE_ADMINISTRADOR';

export function useSolicitudesPendientes() {
  return useQuery({
    queryKey: ['aprobaciones'],
    queryFn: async () =>
      (await api.get<{ data: Solicitud[] }>('/solicitudes', { params: { estado: PENDIENTES } })).data.data,
  });
}

export function useAprobar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, monto_aprobado }: { id: number; monto_aprobado: number }) =>
      (await api.post(`/solicitudes/${id}/aprobar`, { monto_aprobado })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['aprobaciones'] });
      qc.invalidateQueries({ queryKey: ['solicitudes'] });
    },
  });
}

export function useRechazar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, motivo }: { id: number; motivo: string }) =>
      (await api.post(`/solicitudes/${id}/rechazar`, { motivo })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['aprobaciones'] });
      qc.invalidateQueries({ queryKey: ['solicitudes'] });
    },
  });
}

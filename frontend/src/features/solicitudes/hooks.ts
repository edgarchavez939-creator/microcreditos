import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Solicitud } from '@/types';
import type { SolicitudForm } from './schema';

export function useSolicitudes() {
  return useQuery({
    queryKey: ['solicitudes'],
    queryFn: async () => (await api.get<{ data: Solicitud[] }>('/solicitudes')).data.data,
  });
}

export function useCrearSolicitud() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SolicitudForm) =>
      (await api.post<{ data: Solicitud }>('/solicitudes', payload)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['solicitudes'] }),
  });
}

export function useAprobarSolicitud() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await api.post(`/solicitudes/${id}/aprobar`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['solicitudes'] }),
  });
}

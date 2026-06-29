import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Solicitud } from '@/types';

// Créditos sobre los que se puede operar (desembolsar o pagar)
const OPERABLES = 'APROBADO,DESEMBOLSADO,ACTIVO,EN_MORA';

export function useCreditos() {
  return useQuery({
    queryKey: ['cartera'],
    queryFn: async () =>
      (await api.get<{ data: Solicitud[] }>('/solicitudes', { params: { estado: OPERABLES } })).data.data,
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
    mutationFn: async ({ id, metodo }: { id: number; metodo: string }) =>
      (await api.post(`/solicitudes/${id}/desembolsar`, { metodo })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cartera'] }),
  });
}

export function useRegistrarPago() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      solicitud_id: number; valor: number; metodo: string; observaciones?: string; client_uuid: string;
    }) => (await api.post('/pagos', payload)).data,
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['cartera'] });
      qc.invalidateQueries({ queryKey: ['credito', vars.solicitud_id] });
    },
  });
}

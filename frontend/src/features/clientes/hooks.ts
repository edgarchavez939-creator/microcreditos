import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

export interface ClienteListItem {
  id: number; nombres: string; apellidos: string;
  tipo_documento: string; numero_documento: string;
  telefono_principal?: string; area?: string; cobrador?: string;
  latitud?: number | null; longitud?: number | null;
}

export interface Area { id: number; nombre: string; }

export function useCobradores() {
  return useQuery({
    queryKey: ['cobradores'],
    queryFn: async () => (await api.get<{ data: Area[] }>('/cobradores')).data.data,
    staleTime: 5 * 60 * 1000,
  });
}

export function useAreas() {
  return useQuery({
    queryKey: ['areas'],
    queryFn: async () => (await api.get<{ data: Area[] }>('/areas')).data.data,
    staleTime: 5 * 60 * 1000,
  });
}

export function useClientes(buscar = '') {
  return useQuery({
    queryKey: ['clientes', buscar],
    queryFn: async () =>
      (await api.get<{ data: ClienteListItem[] }>('/clientes', { params: { buscar } })).data.data,
  });
}

export function useCrearCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: unknown) => (await api.post('/clientes', payload)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clientes'] }),
  });
}

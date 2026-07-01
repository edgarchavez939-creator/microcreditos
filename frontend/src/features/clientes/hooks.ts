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

export interface ClienteDetalle {
  id: number; nombres: string; apellidos: string;
  tipo_documento: string; numero_documento: string;
  fecha_nacimiento?: string; genero?: string; estado_civil?: string;
  telefono_principal?: string; correo?: string;
  area?: string; cobrador?: string;
  direccion?: string; barrio?: string; referencia_ubicacion?: string;
  latitud?: number | null; longitud?: number | null;
  empresa?: string; cargo?: string; antiguedad_meses?: number; salario?: number; direccion_laboral?: string;
  referencias?: Array<{ tipo: string; nombre: string; telefono?: string; parentesco?: string }>;
}

export interface EntradaHistorial {
  fecha: string; usuario: string; campos: string[]; valores: Record<string, unknown>;
}

export function useClienteDetalle(id: number | null) {
  return useQuery({
    queryKey: ['cliente', id],
    queryFn: async () => (await api.get<{ data: ClienteDetalle }>(`/clientes/${id}`)).data.data,
    enabled: !!id,
  });
}

export function useHistorialCliente(id: number | null) {
  return useQuery({
    queryKey: ['cliente-historial', id],
    queryFn: async () => (await api.get<{ data: EntradaHistorial[] }>(`/clientes/${id}/historial`)).data.data,
    enabled: !!id,
  });
}

export function useActualizarContacto(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { correo: string; telefono_principal: string; direccion: string }) =>
      (await api.patch(`/clientes/${id}/contacto`, data)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cliente', id] });
      qc.invalidateQueries({ queryKey: ['cliente-historial', id] });
      qc.invalidateQueries({ queryKey: ['clientes'] });
    },
  });
}

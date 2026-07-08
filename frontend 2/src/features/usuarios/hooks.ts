import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

export interface UsuarioAdmin {
  id: number;
  nombre: string;
  email: string;
  rol: 'ADMINISTRADOR' | 'SUPERVISOR' | 'COBRADOR';
  telefono?: string | null;
  activo: boolean;
  areas: Array<{ id: number; nombre: string }>;
  ultimo_login_at?: string | null;
}

export interface UsuarioPayload {
  nombre: string;
  email: string;
  password?: string;
  rol: string;
  telefono?: string;
  areas: number[];
  activo?: boolean;
}

export function useUsuarios() {
  return useQuery({
    queryKey: ['usuarios'],
    queryFn: async () => (await api.get<{ data: UsuarioAdmin[] }>('/usuarios')).data.data,
  });
}

export function useCrearUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UsuarioPayload) => (await api.post('/usuarios', payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['usuarios'] }),
  });
}

export function useActualizarUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<UsuarioPayload> & { id: number }) =>
      (await api.patch(`/usuarios/${id}`, payload)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] });
      qc.invalidateQueries({ queryKey: ['cobradores'] });
    },
  });
}

export function useCrearArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { nombre: string; descripcion?: string }) =>
      (await api.post('/areas', payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['areas'] }),
  });
}

export function useActualizarArea() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: number; nombre?: string; activa?: boolean }) =>
      (await api.patch(`/areas/${id}`, payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['areas'] }),
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

export interface MatrizPermisos {
  modulos: Array<{ id: string; etiqueta: string; defecto: string[] }>;
  acciones?: Array<{ id: string; etiqueta: string; defecto: string[] }>;
  reglas_rol: Array<{ modulo: string; rol: string; permitido: boolean }>;
  reglas_usuario: Array<{ modulo: string; usuario_id: number; nombre: string; permitido: boolean }>;
}

/** Módulos habilitados para el usuario actual (alimenta el menú). */
export function useMisPermisos(habilitado: boolean) {
  return useQuery({
    queryKey: ['mis-permisos'],
    queryFn: async () => (await api.get<{ data: string[] }>('/mis-permisos')).data.data,
    enabled: habilitado,
    staleTime: 30_000,
    refetchInterval: 60_000, // los cambios del admin aplican sin re-login
  });
}

export function useMatrizPermisos() {
  return useQuery({
    queryKey: ['permisos-matriz'],
    queryFn: async () => (await api.get<{ data: MatrizPermisos }>('/permisos')).data.data,
  });
}

export function useFijarPermiso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { modulo: string; rol?: string; usuario_id?: number; permitido: boolean }) =>
      (await api.patch('/permisos', payload)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['permisos-matriz'] });
      qc.invalidateQueries({ queryKey: ['mis-permisos'] });
    },
  });
}

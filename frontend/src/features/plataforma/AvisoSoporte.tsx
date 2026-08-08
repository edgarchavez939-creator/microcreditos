import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth';

/**
 * AVISO DE MODO SOPORTE.
 *
 * Cuando el Administrador Global entra a una empresa cliente, esta barra queda
 * fija en la parte superior de la pantalla durante toda la sesión.
 *
 * No es decorativa: quien opera en modo soporte está viendo y pudiendo modificar
 * datos financieros reales de un tercero. Olvidar en qué empresa se está es la
 * causa más probable de un error grave —tocar la cartera equivocada—, así que el
 * recordatorio debe ser imposible de ignorar y la salida, inmediata.
 */
export function AvisoSoporte() {
  const qc = useQueryClient();
  const usuario = useAuthStore((s) => s.usuario);

  const esGlobal = usuario?.rol === 'ADMIN_GLOBAL';

  const { data } = useQuery({
    queryKey: ['soporte-activo'],
    enabled: esGlobal,
    queryFn: async () => (await api.get<{ data: { empresa?: { id: number; nombre: string } | null } }>(
      '/mi-marca')).data.data.empresa ?? null,
    refetchInterval: 30_000,
  });

  const salir = useMutation({
    mutationFn: async () => (await api.post('/plataforma/soporte/salir')).data,
    onSuccess: () => {
      // Cambia el contexto de datos por completo: se recarga todo.
      qc.invalidateQueries();
      window.location.reload();
    },
  });

  if (!esGlobal || !data) return null;

  return (
    <div
      role="alert"
      className="sticky top-0 z-sticky flex flex-wrap items-center justify-between gap-2
        bg-estado-pendiente px-4 py-2 text-white shadow-[0_2px_8px_rgb(15_23_42/0.15)]"
    >
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/25 text-[11px] font-bold">
          !
        </span>
        <span className="min-w-0">
          <b>Modo soporte</b> · estás operando dentro de{' '}
          <b className="underline decoration-white/40">{data.nombre}</b>.
          <span className="hidden sm:inline"> Todas tus acciones quedan registradas.</span>
        </span>
      </div>

      <button
        onClick={() => salir.mutate()}
        disabled={salir.isPending}
        className="shrink-0 rounded-lg bg-white/20 px-3 py-1 text-xs font-semibold
          transition-colors duration-rapido hover:bg-white/30"
      >
        {salir.isPending ? 'Saliendo…' : 'Salir del modo soporte'}
      </button>
    </div>
  );
}

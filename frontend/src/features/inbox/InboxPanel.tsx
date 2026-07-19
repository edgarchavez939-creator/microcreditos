import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { fechaHora } from '@/lib/format';
import { useNavStore } from '@/stores/nav';
import { SkeletonIndicadores } from '@/components/ui/Skeleton';

interface ItemTarea {
  id: number;
  titulo: string;
  detalle: string;
  fecha: string;
  modulo: string;
}
interface GrupoTareas {
  clave: string;
  titulo: string;
  tono: 'atencion' | 'info' | 'alerta';
  items: ItemTarea[];
}
interface Inbox {
  total: number;
  grupos: GrupoTareas[];
}

const TONO: Record<string, { chip: string; punto: string }> = {
  atencion: { chip: 'bg-amber-100 text-amber-800', punto: 'bg-amber-500' },
  info: { chip: 'bg-sky-100 text-sky-700', punto: 'bg-sky-500' },
  alerta: { chip: 'bg-rose-100 text-rose-700', punto: 'bg-rose-500' },
};

/**
 * INBOX DE TRABAJO — una sola pantalla con todo lo que el usuario tiene pendiente:
 * solicitudes por aprobar, transferencias por validar, cajas por recibir y
 * obligaciones. Cada ítem lleva a resolverse en su módulo. Refleja el estado real
 * del trabajo (mismo criterio que los badges): una tarea desaparece al resolverse.
 */
export function InboxPanel() {
  const irA = useNavStore((s) => s.irA);
  const { data, isLoading } = useQuery({
    queryKey: ['inbox'],
    queryFn: async () => (await api.get<{ data: Inbox }>('/tareas/inbox')).data.data,
    refetchInterval: 30_000,
  });

  return (
    <div>
      <div className="mb-5">
        <h2 className="page-title">Bandeja de trabajo</h2>
        <p className="mt-0.5 text-sm text-content-muted">
          {isLoading ? 'Cargando tus tareas pendientes…'
            : data && data.total > 0 ? `Tienes ${data.total} tarea(s) pendiente(s).`
            : 'Todo al día. No tienes tareas pendientes.'}
        </p>
      </div>

      {isLoading ? (
        <SkeletonIndicadores cantidad={3} />
      ) : !data || data.total === 0 ? (
        <div className="card card-pad flex flex-col items-center py-12 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-money-100 text-money-700">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
          </span>
          <p className="mt-3 font-medium text-content-strong">Bandeja vacía</p>
          <p className="text-sm text-content-muted">Cuando tengas solicitudes, transferencias o cajas pendientes, aparecerán aquí.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {data.grupos.map((g) => (
            <div key={g.clave} className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-border-token px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${TONO[g.tono].punto}`} />
                  <h3 className="text-sm font-semibold text-content-strong">{g.titulo}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONO[g.tono].chip}`}>{g.items.length}</span>
                </div>
                <button onClick={() => irA(g.clave)} className="text-sm text-brand-600 hover:underline">Ver módulo →</button>
              </div>
              <ul>
                {g.items.map((it) => (
                  <li key={`${g.clave}-${it.id}`}>
                    <button onClick={() => irA(it.modulo)}
                      className="flex w-full items-center gap-3 border-b border-border-token px-4 py-3 text-left transition last:border-0 hover:bg-surface-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-content-strong">{it.titulo}</div>
                        <div className="truncate text-xs text-content-muted">{it.detalle}</div>
                      </div>
                      <time className="shrink-0 text-xs text-content-muted">{fechaHora(it.fecha)}</time>
                      <span className="shrink-0 text-content-muted">→</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Bloques de carga (skeleton) que imitan la forma del contenido mientras llega. */

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200/70 ${className}`} />;
}

/** Skeleton para una tabla: encabezado + filas. */
export function SkeletonTabla({ filas = 5, columnas = 4 }: { filas?: number; columnas?: number }) {
  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-slate-200">
      <div className="flex gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3">
        {Array.from({ length: columnas }).map((_, i) => (
          <Skeleton key={i} className="h-3.5 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: filas }).map((_, r) => (
          <div key={r} className="flex gap-4 px-4 py-3.5">
            {Array.from({ length: columnas }).map((_, c) => (
              <Skeleton key={c} className={`h-4 flex-1 ${c === 0 ? 'max-w-[40%]' : ''}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Skeleton para listas de tarjetas (cartera, aprobaciones, ruta). */
export function SkeletonTarjetas({ cantidad = 3 }: { cantidad?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: cantidad }).map((_, i) => (
        <div key={i} className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-slate-100">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, j) => (
              <div key={j}>
                <Skeleton className="h-2.5 w-16" />
                <Skeleton className="mt-1.5 h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Skeleton para tarjetas de indicadores del dashboard. */
export function SkeletonIndicadores({ cantidad = 6 }: { cantidad?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: cantidad }).map((_, i) => (
        <div key={i} className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-slate-100">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-7 w-28" />
          <Skeleton className="mt-2 h-2.5 w-16" />
        </div>
      ))}
    </div>
  );
}

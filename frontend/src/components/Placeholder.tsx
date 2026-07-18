interface Props { titulo: string; descripcion: string; permisos?: string[] }

export function Placeholder({ titulo, descripcion, permisos }: Props) {
  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <h2 className="text-xl font-bold">{titulo}</h2>
        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
          En construcción
        </span>
      </div>
      <div className="card card-pad max-w-2xl">
        <p className="text-sm text-slate-600">{descripcion}</p>
        {permisos && permisos.length > 0 && (
          <ul className="mt-4 space-y-2">
            {permisos.map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-sm text-slate-600">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                {p}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-5 rounded-xl bg-surface-2 px-3.5 py-2.5 text-xs text-content-muted ring-1 ring-border-token">
          El backend, los permisos y la lógica de este módulo ya existen; falta conectar esta interfaz a los endpoints correspondientes.
        </p>
      </div>
    </div>
  );
}

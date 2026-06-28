interface Props {
  titulo: string;
  descripcion: string;
  permisos?: string[];
}

/** Pantalla "en construcción" que documenta lo que irá en cada módulo por rol. */
export function Placeholder({ titulo, descripcion, permisos }: Props) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
          En construcción
        </span>
        <h3 className="text-base font-semibold">{titulo}</h3>
      </div>
      <p className="mt-2 text-sm text-slate-600">{descripcion}</p>
      {permisos && permisos.length > 0 && (
        <ul className="mt-3 list-disc pl-5 text-sm text-slate-500 space-y-1">
          {permisos.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
      <p className="mt-4 text-xs text-slate-400">
        El backend, los permisos y la lógica de este módulo ya existen; falta la interfaz, que se conectará a los endpoints correspondientes.
      </p>
    </div>
  );
}

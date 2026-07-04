import { useMemo, useState } from 'react';
import { useMatrizPermisos, useFijarPermiso } from './hooks';
import { useUsuarios } from '@/features/usuarios/hooks';

const ROLES = ['ADMINISTRADOR', 'SUPERVISOR', 'COBRADOR'] as const;
type Rol = (typeof ROLES)[number];

export function PermisosPanel() {
  const { data, isLoading, isError, error } = useMatrizPermisos();
  const fijar = useFijarPermiso();
  const [vista, setVista] = useState<'roles' | 'usuario'>('roles');

  if (isLoading) return <p className="text-sm text-slate-500">Cargando permisos…</p>;
  if (isError || !data) {
    const e = error as { response?: { data?: { message?: string; donde?: string }; status?: number } };
    return (
      <div className="alert-error">
        <p>No se pudieron cargar los permisos ({e?.response?.status ?? 'error'}).</p>
        {e?.response?.data?.message && (
          <pre className="mt-2 whitespace-pre-wrap break-all text-[11px]">
            {e.response.data.message}{e.response.data.donde ? `\n@ ${e.response.data.donde}` : ''}
          </pre>
        )}
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-1 text-xl font-bold">Permisos</h2>
      <p className="mb-4 text-sm text-slate-500">
        Habilita o restringe el acceso a cada módulo. Los cambios aplican de inmediato; el módulo desaparece del menú de quien no lo tenga.
      </p>

      <div className="mb-4 flex rounded-xl bg-slate-100 p-1 w-fit">
        <button onClick={() => setVista('roles')}
          className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${vista === 'roles' ? 'bg-white text-ink shadow-card' : 'text-slate-500 hover:text-ink'}`}>
          Por rol
        </button>
        <button onClick={() => setVista('usuario')}
          className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${vista === 'usuario' ? 'bg-white text-ink shadow-card' : 'text-slate-500 hover:text-ink'}`}>
          Por usuario
        </button>
      </div>

      {vista === 'roles' ? <MatrizRoles data={data} fijar={fijar} /> : <MatrizUsuario data={data} fijar={fijar} />}
    </div>
  );
}

function estadoRol(data: ReturnType<typeof useMatrizPermisos>['data'], modulo: string, rol: Rol, defecto: string[]): boolean {
  const regla = data!.reglas_rol.find((r) => r.modulo === modulo && r.rol === rol);
  return regla ? regla.permitido : defecto.includes(rol);
}

function MatrizRoles({ data, fijar }: { data: NonNullable<ReturnType<typeof useMatrizPermisos>['data']>; fijar: ReturnType<typeof useFijarPermiso> }) {
  return (
    <div className="table-wrap">
      <table className="table-base">
        <thead>
          <tr>
            <th className="px-3 py-2 text-left">Módulo</th>
            {ROLES.map((r) => <th key={r} className="px-3 py-2 text-center">{r.charAt(0) + r.slice(1).toLowerCase()}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.modulos.map((m) => (
            <tr key={m.id} className="border-t">
              <td className="px-3 py-2 font-medium">{m.etiqueta}</td>
              {ROLES.map((rol) => {
                const activo = estadoRol(data, m.id, rol, m.defecto);
                const bloqueado = rol === 'ADMINISTRADOR' && (m.id === 'usuarios' || m.id === 'parametros' || m.id === 'permisos');
                return (
                  <td key={rol} className="px-3 py-2 text-center">
                    <Interruptor
                      activo={activo}
                      deshabilitado={bloqueado || fijar.isPending}
                      onChange={(v) => fijar.mutate({ modulo: m.id, rol, permitido: v })}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MatrizUsuario({ data, fijar }: { data: NonNullable<ReturnType<typeof useMatrizPermisos>['data']>; fijar: ReturnType<typeof useFijarPermiso> }) {
  const { data: usuarios } = useUsuarios();
  const [usuarioId, setUsuarioId] = useState<number | null>(null);

  const usuario = useMemo(() => usuarios?.find((u) => u.id === usuarioId) ?? null, [usuarios, usuarioId]);

  return (
    <div>
      <label className="mb-4 block text-sm">
        <span className="mb-1 block text-slate-600">Usuario</span>
        <select value={usuarioId ?? ''} onChange={(e) => setUsuarioId(e.target.value ? Number(e.target.value) : null)}
          className="input max-w-sm">
          <option value="">Selecciona un usuario…</option>
          {usuarios?.map((u) => <option key={u.id} value={u.id}>{u.nombre} · {u.rol}</option>)}
        </select>
      </label>

      {usuario && (
        <>
          <p className="mb-2 text-xs text-slate-500">
            Una regla por usuario tiene prioridad sobre la de su rol. Deja sin regla para heredar del rol ({usuario.rol}).
          </p>
          <div className="table-wrap">
            <table className="table-base">
              <thead><tr><th className="px-3 py-2 text-left">Módulo</th><th className="px-3 py-2 text-center">Acceso específico</th></tr></thead>
              <tbody>
                {data.modulos.map((m) => {
                  const regla = data.reglas_usuario.find((r) => r.modulo === m.id && r.usuario_id === usuario.id);
                  const heredado = m.defecto.includes(usuario.rol);
                  return (
                    <tr key={m.id} className="border-t">
                      <td className="px-3 py-2 font-medium">{m.etiqueta}
                        {regla === undefined && <span className="ml-2 text-xs text-slate-400">(hereda: {heredado ? 'sí' : 'no'})</span>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Interruptor
                          activo={regla ? regla.permitido : heredado}
                          deshabilitado={fijar.isPending}
                          onChange={(v) => fijar.mutate({ modulo: m.id, usuario_id: usuario.id, permitido: v })}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Interruptor({ activo, onChange, deshabilitado }: { activo: boolean; onChange: (v: boolean) => void; deshabilitado?: boolean }) {
  return (
    <button
      onClick={() => onChange(!activo)}
      disabled={deshabilitado}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition disabled:opacity-40 ${activo ? 'bg-money-500' : 'bg-slate-300'}`}
      aria-pressed={activo}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${activo ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

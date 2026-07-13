import { useState } from 'react';
import { useAreas } from '@/features/clientes/hooks';
import { useActualizarArea, useActualizarUsuario, useCrearArea, useCrearUsuario, useUsuarios, type UsuarioAdmin } from './hooks';
import { EstadoVacio, IconosVacio } from '@/components/ui/EstadoVacio';

const ROLES = [
  { v: 'COBRADOR', t: 'Cobrador' },
  { v: 'SUPERVISOR', t: 'Supervisor' },
  { v: 'ADMINISTRADOR', t: 'Administrador' },
];
const ROL_LABEL: Record<string, string> = { COBRADOR: 'Cobrador', SUPERVISOR: 'Supervisor', ADMINISTRADOR: 'Administrador' };

export function UsuariosPanel() {
  const { data: usuarios, isLoading } = useUsuarios();
  const [editando, setEditando] = useState<UsuarioAdmin | null>(null);
  const [creando, setCreando] = useState(false);

  return (
    <div>
      <h2 className="page-title">Usuarios</h2>
      <p className="mb-5 text-sm text-slate-500">Crea cobradores, supervisores y administradores, y asigna sus áreas.</p>

      {creando || editando ? (
        <UsuarioForm usuario={editando} onCerrar={() => { setCreando(false); setEditando(null); }} />
      ) : (
        <>
          <div className="mb-4">
            <button onClick={() => setCreando(true)} className="btn-primary">+ Nuevo usuario</button>
          </div>

          {isLoading ? (
            <p className="text-sm text-slate-500">Cargando usuarios…</p>
          ) : !usuarios || usuarios.length === 0 ? (
            <EstadoVacio icono={IconosVacio.usuarios} titulo="Sin usuarios" descripcion="Aún no hay usuarios registrados en el sistema." />
          ) : (
            <div className="table-wrap">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Nombre</th><th>Correo</th><th>Rol</th><th>Áreas</th><th>Estado</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((u) => (
                    <tr key={u.id} className="border-t">
                      <td className="font-medium">{u.nombre}</td>
                      <td>{u.email}</td>
                      <td>{ROL_LABEL[u.rol]}</td>
                      <td className="max-w-[200px] truncate">{u.areas.map((a) => a.nombre).join(', ') || '—'}</td>
                      <td>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${u.activo ? 'bg-money-50 text-money-700' : 'bg-slate-100 text-slate-500'}`}>
                          {u.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="text-right">
                        <button onClick={() => setEditando(u)} className="btn-outline btn-sm">Editar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <SeccionAreas />
        </>
      )}
    </div>
  );
}

function SeccionAreas() {
  const { data: areas } = useAreas();
  const crear = useCrearArea();
  const actualizar = useActualizarArea();
  const [nombre, setNombre] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [error, setError] = useState<string | null>(null);

  const err = (e: unknown) => {
    const x = e as { response?: { data?: { message?: string } } };
    setError(x?.response?.data?.message ?? 'No se pudo guardar el área.');
  };

  return (
    <div className="card card-pad mt-6">
      <h3 className="mb-1 font-semibold">Áreas / territorios</h3>
      <p className="mb-3 text-sm text-slate-500">Crea las zonas de trabajo y asígnalas a los usuarios.</p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre de la nueva área (ej. Occidente)" className="input max-w-xs" />
        <button
          onClick={() => {
            setError(null);
            if (nombre.trim().length < 3) { setError('El nombre del área debe tener al menos 3 caracteres.'); return; }
            crear.mutate({ nombre: nombre.trim() }, { onSuccess: () => setNombre(''), onError: err });
          }}
          disabled={crear.isPending} className="btn-primary btn-sm">
          {crear.isPending ? 'Creando…' : '+ Crear área'}
        </button>
      </div>

      {error && <p className="mb-3 alert-error">{error}</p>}

      <ul className="divide-y divide-slate-100">
        {areas?.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-2 py-2 text-sm">
            {editId === a.id ? (
              <>
                <input value={editNombre} onChange={(e) => setEditNombre(e.target.value)} className="input max-w-xs py-1.5" />
                <span className="flex gap-2">
                  <button
                    onClick={() => {
                      setError(null);
                      actualizar.mutate({ id: a.id, nombre: editNombre.trim() },
                        { onSuccess: () => setEditId(null), onError: err });
                    }}
                    disabled={actualizar.isPending} className="btn-primary btn-sm">Guardar</button>
                  <button onClick={() => setEditId(null)} className="btn-ghost btn-sm">Cancelar</button>
                </span>
              </>
            ) : (
              <>
                <span className="font-medium">{a.nombre}</span>
                <button onClick={() => { setEditId(a.id); setEditNombre(a.nombre); }} className="btn-outline btn-sm">
                  Renombrar
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function UsuarioForm({ usuario, onCerrar }: { usuario: UsuarioAdmin | null; onCerrar: () => void }) {
  const { data: areas } = useAreas();
  const crear = useCrearUsuario();
  const actualizar = useActualizarUsuario();

  const [nombres, setNombres] = useState(usuario?.nombres ?? '');
  const [apellidos, setApellidos] = useState(usuario?.apellidos ?? '');
  const [tipoDoc, setTipoDoc] = useState(usuario?.tipo_documento ?? 'CC');
  const [numeroDoc, setNumeroDoc] = useState(usuario?.numero_documento ?? '');
  const [email, setEmail] = useState(usuario?.email ?? '');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState(usuario?.rol ?? 'COBRADOR');
  const [telefono, setTelefono] = useState(usuario?.telefono ?? '');
  const [direccion, setDireccion] = useState(usuario?.direccion ?? '');
  const [fechaNac, setFechaNac] = useState(usuario?.fecha_nacimiento?.slice(0, 10) ?? '');
  const [emergNombre, setEmergNombre] = useState(usuario?.contacto_emergencia_nombre ?? '');
  const [emergTel, setEmergTel] = useState(usuario?.contacto_emergencia_telefono ?? '');
  const [salario, setSalario] = useState(usuario?.salario_base != null ? String(usuario.salario_base) : '');
  const [banco, setBanco] = useState(usuario?.banco ?? '');
  const [numeroCuenta, setNumeroCuenta] = useState(usuario?.numero_cuenta ?? '');
  const [activo, setActivo] = useState(usuario?.activo ?? true);
  const [areasSel, setAreasSel] = useState<number[]>(usuario?.areas.map((a) => a.id) ?? []);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const pending = crear.isPending || actualizar.isPending;

  const toggleArea = (id: number) =>
    setAreasSel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const onError = (e: unknown) => {
    const x = e as { response?: { data?: { message?: string } } };
    setError(x?.response?.data?.message ?? 'No se pudo guardar el usuario.');
  };

  const guardar = () => {
    setError(null); setMsg(null);
    if (!nombres.trim()) { setError('Ingresa los nombres.'); return; }
    if (!apellidos.trim()) { setError('Ingresa los apellidos.'); return; }
    if (!email.trim()) { setError('Ingresa el correo.'); return; }
    if (!usuario && password.length < 10) { setError('La contraseña debe tener al menos 10 caracteres.'); return; }
    if (usuario && password && password.length < 10) { setError('La nueva contraseña debe tener al menos 10 caracteres.'); return; }
    if (areasSel.length === 0) { setError('Selecciona al menos un área.'); return; }

    const ficha = {
      nombres, apellidos,
      tipo_documento: tipoDoc, numero_documento: numeroDoc || undefined,
      email, rol, telefono: telefono || undefined,
      direccion: direccion || undefined,
      fecha_nacimiento: fechaNac || undefined,
      contacto_emergencia_nombre: emergNombre || undefined,
      contacto_emergencia_telefono: emergTel || undefined,
      salario_base: salario ? Number(salario) : undefined,
      banco: banco || undefined,
      numero_cuenta: numeroCuenta || undefined,
      areas: areasSel,
    };

    if (!usuario) {
      crear.mutate({ ...ficha, password }, { onSuccess: onCerrar, onError });
    } else {
      actualizar.mutate(
        { id: usuario.id, ...ficha, activo, ...(password ? { password } : {}) },
        { onSuccess: onCerrar, onError },
      );
    }
  };

  return (
    <div className="card card-pad max-w-lg space-y-4">
      <h3 className="font-semibold">{usuario ? `Editar: ${usuario.nombre}` : 'Nuevo usuario'}</h3>

      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Identificación</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Nombres</label>
          <input value={nombres} onChange={(e) => setNombres(e.target.value)} className="input" />
        </div>
        <div>
          <label className="label">Apellidos</label>
          <input value={apellidos} onChange={(e) => setApellidos(e.target.value)} className="input" />
        </div>
        <div>
          <label className="label">Tipo de identificación</label>
          <select value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value)} className="input">
            <option value="CC">Cédula de ciudadanía</option>
            <option value="CE">Cédula de extranjería</option>
            <option value="TI">Tarjeta de identidad</option>
            <option value="PASAPORTE">Pasaporte</option>
            <option value="NIT">NIT</option>
          </select>
        </div>
        <div>
          <label className="label">Número de identificación</label>
          <input value={numeroDoc} onChange={(e) => setNumeroDoc(e.target.value)} className="input" />
        </div>
      </div>

      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Acceso al sistema</p>
      <div>
        <label className="label">Correo</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
      </div>
      <div>
        <label className="label">{usuario ? 'Nueva contraseña (opcional, mín. 10)' : 'Contraseña (mín. 10 caracteres)'}</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input"
          placeholder={usuario ? 'Dejar en blanco para no cambiarla' : ''} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Rol</label>
          <select value={rol} onChange={(e) => setRol(e.target.value as UsuarioAdmin['rol'])} className="input">
            {ROLES.map((r) => <option key={r.v} value={r.v}>{r.t}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Teléfono (opcional)</label>
          <input value={telefono ?? ''} onChange={(e) => setTelefono(e.target.value)} className="input" />
        </div>
      </div>

      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Contacto</p>
      <div>
        <label className="label">Dirección de residencia</label>
        <input value={direccion} onChange={(e) => setDireccion(e.target.value)} className="input" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Fecha de nacimiento</label>
          <input type="date" value={fechaNac} onChange={(e) => setFechaNac(e.target.value)} className="input" />
        </div>
        <div>
          <label className="label">Tel. contacto de emergencia</label>
          <input value={emergTel} onChange={(e) => setEmergTel(e.target.value)} className="input" />
        </div>
      </div>
      <div>
        <label className="label">Nombre del contacto de emergencia</label>
        <input value={emergNombre} onChange={(e) => setEmergNombre(e.target.value)} className="input" />
      </div>

      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Laboral y financiero</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Salario base (opcional)</label>
          <input type="number" value={salario} onChange={(e) => setSalario(e.target.value)} className="input" />
        </div>
        <div>
          <label className="label">Banco (opcional)</label>
          <input value={banco} onChange={(e) => setBanco(e.target.value)} className="input" />
        </div>
      </div>
      <div>
        <label className="label">Número de cuenta (opcional)</label>
        <input value={numeroCuenta} onChange={(e) => setNumeroCuenta(e.target.value)} className="input" />
      </div>

      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Asignación</p>
      <div>
        <label className="label">Áreas asignadas</label>
        <div className="flex flex-wrap gap-2">
          {areas?.map((a) => (
            <button key={a.id} type="button" onClick={() => toggleArea(a.id)}
              className={`rounded-full px-3 py-1.5 text-sm ring-1 transition ${
                areasSel.includes(a.id)
                  ? 'bg-brand text-white ring-brand'
                  : 'bg-white text-slate-600 ring-slate-200 hover:ring-brand-200'
              }`}>
              {a.nombre}
            </button>
          ))}
        </div>
      </div>

      {usuario && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
          Cuenta activa (desmarca para bloquear el acceso)
        </label>
      )}

      {error && <p className="alert-error">{error}</p>}
      {msg && <p className="text-sm text-green-700">{msg}</p>}

      <div className="flex gap-2">
        <button onClick={guardar} disabled={pending} className="btn-primary">
          {pending ? 'Guardando…' : usuario ? 'Guardar cambios' : 'Crear usuario'}
        </button>
        <button onClick={onCerrar} className="btn-ghost">Cancelar</button>
      </div>
    </div>
  );
}

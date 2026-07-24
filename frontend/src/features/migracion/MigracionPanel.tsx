import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { api } from '@/lib/api/client';
import { money, fecha } from '@/lib/format';
import { EscalaMoneda } from '@/components/ui/EscalaMoneda';

/**
 * MIGRACIÓN DE CARTERA — Fase 1 (asistente de importación con simulador).
 *
 * Flujo obligatorio en 4 pasos:
 *  1) Subir archivo (Excel/CSV) — se lee en el navegador, nunca se sube crudo.
 *  2) Mapear columnas del archivo a los campos del sistema (con plantillas).
 *  3) Valores por defecto (área, cobrador, producto) para lo que el archivo no traiga.
 *  4) SIMULACIÓN (sin tocar la base de datos) → revisar → confirmar importación.
 */

interface Opciones {
  campos: string[];
  plantillas: { id: number; nombre: string; mapeo: Record<string, string> | string }[];
  areas: { id: number; nombre: string }[];
  cobradores: { id: number; nombre: string }[];
  productos: { id: number; nombre: string }[];
}
interface ResumenSim {
  migracion_id: number; total: number; validos: number; con_advertencias: number; con_errores: number;
  clientes_a_crear: number; clientes_a_actualizar: number; creditos_a_crear: number; creditos_omitidos: number;
}
interface RegistroSim {
  fila: number; datos: string; resultado: 'VALIDO' | 'ADVERTENCIA' | 'ERROR';
  mensajes: string; accion_cliente: string | null; accion_credito: string | null;
}
interface Lote {
  id: number; nombre_archivo: string; estado: string; created_at: string; importada_at: string | null;
  total_registros: number; validos: number; con_errores: number; con_advertencias: number;
  creditos_a_crear: number; usuario: string;
}

const ETIQUETAS_CAMPO: Record<string, string> = {
  tipo_documento: 'Tipo de documento', numero_documento: 'N° documento *', nombres: 'Nombres *',
  apellidos: 'Apellidos *', saldo_pendiente: 'Saldo pendiente *', producto: 'Producto',
  celular: 'Celular', telefono: 'Teléfono', direccion: 'Dirección', barrio: 'Barrio',
  ciudad: 'Ciudad', departamento: 'Departamento', area: 'Área', cobrador: 'Cobrador',
  fecha_desembolso: 'Fecha desembolso', fecha_ultimo_pago: 'Fecha último pago',
  valor_desembolsado: 'Valor desembolsado', numero_cuotas: 'N° cuotas',
  cuotas_pendientes: 'Cuotas pendientes', modalidad: 'Modalidad', observaciones: 'Observaciones',
};

/** Autodetección: sugiere el campo del sistema según el nombre de la columna. */
function sugerirCampo(columna: string, campos: string[]): string {
  const n = columna.toLowerCase().replace(/[^a-zñ]/g, '');
  const mapa: Record<string, string> = {
    tipodocumento: 'tipo_documento', tipodoc: 'tipo_documento',
    documento: 'numero_documento', cedula: 'numero_documento', identificacion: 'numero_documento', numerodocumento: 'numero_documento', nit: 'numero_documento',
    nombre: 'nombres', nombres: 'nombres', apellido: 'apellidos', apellidos: 'apellidos',
    saldo: 'saldo_pendiente', saldopendiente: 'saldo_pendiente', deuda: 'saldo_pendiente', saldoactual: 'saldo_pendiente',
    producto: 'producto', tipocredito: 'producto', linea: 'producto',
    celular: 'celular', movil: 'celular', telefono: 'telefono', tel: 'telefono',
    direccion: 'direccion', barrio: 'barrio', ciudad: 'ciudad', departamento: 'departamento',
    area: 'area', zona: 'area', ruta: 'area', cobrador: 'cobrador', asesor: 'cobrador', gestor: 'cobrador',
    fechadesembolso: 'fecha_desembolso', desembolso: 'fecha_desembolso',
    fechaultimopago: 'fecha_ultimo_pago', ultimopago: 'fecha_ultimo_pago',
    valordesembolsado: 'valor_desembolsado', montoinicial: 'valor_desembolsado', capital: 'valor_desembolsado',
    cuotas: 'numero_cuotas', numerocuotas: 'numero_cuotas', cuotaspendientes: 'cuotas_pendientes',
    modalidad: 'modalidad', frecuencia: 'modalidad', periodicidad: 'modalidad',
    observaciones: 'observaciones', notas: 'observaciones', comentario: 'observaciones',
  };
  const hit = mapa[n];
  return hit && campos.includes(hit) ? hit : '';
}

export function MigracionPanel() {
  const qc = useQueryClient();
  const [paso, setPaso] = useState(1);
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [encabezados, setEncabezados] = useState<string[]>([]);
  const [filasCrudas, setFilasCrudas] = useState<Record<string, unknown>[]>([]);
  const [mapeo, setMapeo] = useState<Record<string, string>>({});   // columna archivo -> campo sistema
  const [nombrePlantilla, setNombrePlantilla] = useState('');
  const [areaDef, setAreaDef] = useState('');
  const [cobradorDef, setCobradorDef] = useState('');
  const [productoDef, setProductoDef] = useState('');
  const [resumen, setResumen] = useState<ResumenSim | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: opciones } = useQuery({
    queryKey: ['migracion-opciones'],
    queryFn: async () => (await api.get<{ data: Opciones }>('/migraciones/opciones')).data.data,
  });
  const { data: lotes } = useQuery({
    queryKey: ['migraciones'],
    queryFn: async () => (await api.get<{ data: Lote[] }>('/migraciones')).data.data,
  });
  const { data: registros } = useQuery({
    queryKey: ['migracion-registros', resumen?.migracion_id],
    enabled: !!resumen,
    queryFn: async () => (await api.get<{ data: RegistroSim[] }>(`/migraciones/${resumen!.migracion_id}/registros`)).data.data,
  });

  // ---------- Paso 1: leer el archivo en el navegador ----------
  const leerArchivo = (file: File) => {
    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'array', cellDates: true });
        const hoja = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { defval: '' });
        if (json.length === 0) { setError('El archivo está vacío o no tiene datos legibles.'); return; }
        if (json.length > 5000) { setError('Máximo 5.000 registros por archivo. Divide el archivo y repite.'); return; }
        const cols = Object.keys(json[0]);
        setNombreArchivo(file.name);
        setEncabezados(cols);
        setFilasCrudas(json);
        // Autodetección inicial del mapeo
        const auto: Record<string, string> = {};
        for (const c of cols) auto[c] = sugerirCampo(c, opciones?.campos ?? []);
        setMapeo(auto);
        setPaso(2);
      } catch {
        setError('No se pudo leer el archivo. Verifica que sea un Excel (.xlsx) o CSV válido.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const aplicarPlantilla = (id: string) => {
    const p = opciones?.plantillas.find((x) => String(x.id) === id);
    if (!p) return;
    const m = typeof p.mapeo === 'string' ? JSON.parse(p.mapeo) : p.mapeo;
    // Solo aplica sobre columnas presentes en este archivo
    const nuevo: Record<string, string> = {};
    for (const c of encabezados) nuevo[c] = m[c] ?? mapeo[c] ?? '';
    setMapeo(nuevo);
  };

  const guardarPlantilla = useMutation({
    mutationFn: async () => (await api.post('/migraciones/plantillas', { nombre: nombrePlantilla, mapeo })).data,
    onSuccess: () => { setMsg('Plantilla guardada ✓'); qc.invalidateQueries({ queryKey: ['migracion-opciones'] }); },
    onError: () => setError('No se pudo guardar la plantilla.'),
  });

  // ---------- Paso 4: simular ----------
  const camposMapeados = useMemo(() => Object.values(mapeo).filter(Boolean), [mapeo]);
  const faltanObligatorios = ['numero_documento', 'nombres', 'apellidos', 'saldo_pendiente']
    .filter((c) => !camposMapeados.includes(c));

  const simular = useMutation({
    mutationFn: async () => {
      // Normalizar: cada fila cruda -> {campo_sistema: valor}
      const filas = filasCrudas.map((f) => {
        const out: Record<string, unknown> = {};
        for (const [col, campo] of Object.entries(mapeo)) {
          if (campo) out[campo] = f[col];
        }
        return out;
      });
      return (await api.post<{ data: ResumenSim }>('/migraciones/simular', {
        filas,
        nombre_archivo: nombreArchivo,
        area_defecto_id: areaDef ? Number(areaDef) : undefined,
        cobrador_defecto_id: cobradorDef ? Number(cobradorDef) : undefined,
        producto_defecto_id: productoDef ? Number(productoDef) : undefined,
      })).data.data;
    },
    onSuccess: (r) => { setResumen(r); setPaso(4); setError(null); },
    onError: (err) => setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error en la simulación.'),
  });

  const importar = useMutation({
    mutationFn: async () => (await api.post(`/migraciones/${resumen!.migracion_id}/importar`)).data,
    onSuccess: (r: { message?: string }) => {
      setMsg(r.message ?? 'Importación completada ✓');
      qc.invalidateQueries({ queryKey: ['migraciones'] });
      setPaso(5);
    },
    onError: (err) => setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'La importación falló y se revirtió por completo.'),
  });

  const exportarResultado = () => {
    if (!registros) return;
    const hoja = registros.map((r) => {
      const d = JSON.parse(r.datos) as Record<string, unknown>;
      const msgs = (JSON.parse(r.mensajes) as { tipo: string; texto: string }[]).map((m) => m.texto).join(' | ');
      return {
        Fila: r.fila, Resultado: r.resultado, Documento: d.numero_documento,
        Nombres: `${d.nombres} ${d.apellidos}`, 'Saldo (miles)': Number(d.saldo_pendiente ?? 0) / 1000,
        Cliente: r.accion_cliente ?? '—', 'Crédito': r.accion_credito ?? '—', Mensajes: msgs,
      };
    });
    const ws = XLSX.utils.json_to_sheet(hoja);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Simulación');
    XLSX.writeFile(wb, `simulacion_migracion_${resumen?.migracion_id}.xlsx`);
  };

  const pasoTab = (n: number, t: string) => (
    <div className={`flex items-center gap-1.5 text-xs font-medium ${paso === n ? 'text-brand-700' : paso > n ? 'text-money-700' : 'text-content-muted'}`}>
      <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${paso === n ? 'bg-brand-600 text-white' : paso > n ? 'bg-money-100 text-money-700' : 'bg-surface-3'}`}>
        {paso > n ? '✓' : n}
      </span>
      {t}
    </div>
  );

  return (
    <div>
      <div className="flex items-center gap-3"><h2 className="page-title">Migración de cartera</h2><EscalaMoneda /></div>
      <p className="mb-4 text-sm text-content-muted">
        Importa clientes y créditos desde otra plataforma. Nada se guarda sin pasar por la simulación.
      </p>

      <div className="mb-5 flex flex-wrap gap-4">
        {pasoTab(1, 'Archivo')}{pasoTab(2, 'Mapeo')}{pasoTab(3, 'Por defecto')}{pasoTab(4, 'Simulación')}
      </div>

      {error && <p className="alert-error mb-4">{error}</p>}
      {msg && <p className="mb-4 text-sm text-money-700">{msg}</p>}

      {/* ---------- PASO 1 ---------- */}
      {paso === 1 && (
        <div className="card card-pad">
          <h3 className="mb-2 text-sm font-semibold">1 · Sube el archivo de origen</h3>
          <p className="mb-3 text-xs text-content-muted">
            Formatos: Excel (.xlsx, .xls) o CSV. La primera fila debe contener los nombres de las columnas.
            Máximo 5.000 registros por archivo. El archivo se lee en tu navegador.
          </p>
          <input type="file" accept=".xlsx,.xls,.csv"
            onChange={(e) => e.target.files?.[0] && leerArchivo(e.target.files[0])}
            className="block text-sm" />
        </div>
      )}

      {/* ---------- PASO 2 ---------- */}
      {paso === 2 && (
        <div className="card card-pad">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">2 · Mapea las columnas de "{nombreArchivo}" ({filasCrudas.length} registros)</h3>
            {(opciones?.plantillas.length ?? 0) > 0 && (
              <select onChange={(e) => aplicarPlantilla(e.target.value)} className="input w-auto py-1 text-xs" defaultValue="">
                <option value="" disabled>Aplicar plantilla…</option>
                {opciones!.plantillas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {encabezados.map((col) => (
              <div key={col} className="flex items-center gap-2 text-sm">
                <span className="w-1/2 truncate font-medium" title={col}>{col}</span>
                <select value={mapeo[col] ?? ''} onChange={(e) => setMapeo({ ...mapeo, [col]: e.target.value })}
                  className="input flex-1 py-1 text-xs">
                  <option value="">— No importar —</option>
                  {opciones?.campos.map((c) => (
                    <option key={c} value={c} disabled={Object.entries(mapeo).some(([k, v]) => v === c && k !== col)}>
                      {ETIQUETAS_CAMPO[c] ?? c}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {faltanObligatorios.length > 0 && (
            <p className="mt-3 text-xs text-amber-700">
              Faltan campos obligatorios por mapear: {faltanObligatorios.map((c) => ETIQUETAS_CAMPO[c]).join(', ')}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button onClick={() => setPaso(1)} className="btn-secondary btn-sm">Atrás</button>
            <button onClick={() => setPaso(3)} disabled={faltanObligatorios.length > 0} className="btn-primary btn-sm">Continuar</button>
            <span className="mx-2 text-content-muted">·</span>
            <input value={nombrePlantilla} onChange={(e) => setNombrePlantilla(e.target.value)}
              className="input w-44 py-1 text-xs" placeholder="Nombre de plantilla" />
            <button onClick={() => guardarPlantilla.mutate()} disabled={!nombrePlantilla || guardarPlantilla.isPending}
              className="btn-secondary btn-sm">Guardar plantilla</button>
          </div>
        </div>
      )}

      {/* ---------- PASO 3 ---------- */}
      {paso === 3 && (
        <div className="card card-pad">
          <h3 className="mb-2 text-sm font-semibold">3 · Valores por defecto</h3>
          <p className="mb-3 text-xs text-content-muted">
            Se aplican a todo el archivo cuando la fila no traiga el dato. Área y cobrador son obligatorios
            en el sistema; el producto define el comportamiento del crédito.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label">Área por defecto</label>
              <select value={areaDef} onChange={(e) => setAreaDef(e.target.value)} className="input">
                <option value="">— Selecciona —</option>
                {opciones?.areas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Cobrador por defecto</label>
              <select value={cobradorDef} onChange={(e) => setCobradorDef(e.target.value)} className="input">
                <option value="">— Selecciona —</option>
                {opciones?.cobradores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Producto por defecto</label>
              <select value={productoDef} onChange={(e) => setProductoDef(e.target.value)} className="input">
                <option value="">— Selecciona —</option>
                {opciones?.productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={() => setPaso(2)} className="btn-secondary btn-sm">Atrás</button>
            <button onClick={() => simular.mutate()} disabled={simular.isPending || !areaDef || !cobradorDef || !productoDef}
              className="btn-primary btn-sm">
              {simular.isPending && <span className="spinner" />}
              {simular.isPending ? 'Simulando…' : 'Ejecutar simulación (no guarda nada)'}
            </button>
          </div>
        </div>
      )}

      {/* ---------- PASO 4: RESULTADO DE LA SIMULACIÓN ---------- */}
      {paso === 4 && resumen && (
        <div className="space-y-4">
          <div className="card card-pad">
            <h3 className="mb-3 text-sm font-semibold">4 · Resultado de la simulación — nada se ha guardado aún</h3>
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                ['Registros', resumen.total, ''],
                ['Válidos', resumen.validos, 'text-money-700'],
                ['Con advertencias', resumen.con_advertencias, 'text-amber-700'],
                ['Con errores', resumen.con_errores, 'text-rose-600'],
                ['Clientes a crear', resumen.clientes_a_crear, ''],
                ['Clientes a completar', resumen.clientes_a_actualizar, ''],
                ['Créditos a crear', resumen.creditos_a_crear, 'text-brand-700'],
                ['Créditos omitidos', resumen.creditos_omitidos, 'text-content-muted'],
              ].map(([l, v, cls]) => (
                <div key={l as string} className="rounded-xl bg-surface-2 p-3 text-center">
                  <div className={`font-display text-xl font-bold ${cls}`}>{v as number}</div>
                  <div className="text-xs text-content-muted">{l as string}</div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-content-muted">
              Las filas con errores NO se importarán. Las advertencias sí, con el criterio indicado en cada mensaje.
              Los créditos entran en estado <b>MIGRADO</b> con una cuota única por el saldo (se corrige en el centro
              de validación de la Fase 2).
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => setPaso(3)} className="btn-secondary btn-sm">Atrás</button>
              <button onClick={exportarResultado} className="btn-secondary btn-sm">Descargar resultado (Excel)</button>
              <button onClick={() => importar.mutate()}
                disabled={importar.isPending || resumen.validos === 0}
                className="btn-primary btn-sm">
                {importar.isPending && <span className="spinner" />}
                {importar.isPending ? 'Importando…' : `Confirmar importación (${resumen.creditos_a_crear} créditos)`}
              </button>
            </div>
          </div>

          {registros && registros.length > 0 && (
            <div className="card card-pad overflow-x-auto">
              <h4 className="mb-2 text-sm font-semibold">Detalle por fila</h4>
              <table className="w-full text-xs">
                <thead><tr className="text-left text-content-muted">
                  <th className="py-1 pr-3">Fila</th><th className="py-1 pr-3">Resultado</th>
                  <th className="py-1 pr-3">Documento</th><th className="py-1 pr-3">Nombre</th>
                  <th className="py-1 pr-3">Saldo</th><th className="py-1">Mensajes</th>
                </tr></thead>
                <tbody>
                  {registros.slice(0, 200).map((r) => {
                    const d = JSON.parse(r.datos) as Record<string, unknown>;
                    const msgs = (JSON.parse(r.mensajes) as { texto: string }[]).map((m) => m.texto).join(' · ');
                    return (
                      <tr key={r.fila} className="border-t border-border-token">
                        <td className="py-1 pr-3">{r.fila}</td>
                        <td className={`py-1 pr-3 font-medium ${r.resultado === 'ERROR' ? 'text-rose-600' : r.resultado === 'ADVERTENCIA' ? 'text-amber-700' : 'text-money-700'}`}>{r.resultado}</td>
                        <td className="py-1 pr-3">{String(d.numero_documento ?? '')}</td>
                        <td className="py-1 pr-3">{String(d.nombres ?? '')} {String(d.apellidos ?? '')}</td>
                        <td className="py-1 pr-3 tabular-nums">{money(Number(d.saldo_pendiente ?? 0))}</td>
                        <td className="py-1 text-content-muted">{msgs || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {registros.length > 200 && (
                <p className="mt-2 text-xs text-content-muted">Mostrando 200 de {registros.length}. Descarga el Excel para el detalle completo.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---------- PASO 5: IMPORTADO ---------- */}
      {paso === 5 && (
        <div className="card card-pad text-center">
          <div className="mb-2 text-3xl">✓</div>
          <h3 className="mb-1 text-sm font-semibold">Importación completada</h3>
          <p className="mb-4 text-xs text-content-muted">
            Los créditos quedaron en estado MIGRADO, pendientes de validación. Ya pueden recibir pagos.
          </p>
          <button onClick={() => { setPaso(1); setResumen(null); setFilasCrudas([]); setMsg(null); }}
            className="btn-primary btn-sm">Importar otro archivo</button>
        </div>
      )}

      {/* ---------- HISTORIAL ---------- */}
      {(lotes?.length ?? 0) > 0 && paso !== 4 && (
        <div className="card card-pad mt-5 overflow-x-auto">
          <h3 className="mb-2 text-sm font-semibold">Historial de migraciones</h3>
          <table className="w-full text-xs">
            <thead><tr className="text-left text-content-muted">
              <th className="py-1 pr-3">Fecha</th><th className="py-1 pr-3">Archivo</th>
              <th className="py-1 pr-3">Estado</th><th className="py-1 pr-3">Registros</th>
              <th className="py-1 pr-3">Válidos</th><th className="py-1 pr-3">Errores</th>
              <th className="py-1">Por</th>
            </tr></thead>
            <tbody>
              {lotes!.map((l) => (
                <tr key={l.id} className="border-t border-border-token">
                  <td className="py-1 pr-3">{fecha(l.created_at)}</td>
                  <td className="py-1 pr-3">{l.nombre_archivo}</td>
                  <td className={`py-1 pr-3 font-medium ${l.estado === 'IMPORTADA' ? 'text-money-700' : 'text-amber-700'}`}>{l.estado}</td>
                  <td className="py-1 pr-3">{l.total_registros}</td>
                  <td className="py-1 pr-3">{l.validos}</td>
                  <td className="py-1 pr-3">{l.con_errores}</td>
                  <td className="py-1">{l.usuario}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { useRef, useState } from 'react';
import {
  useDocumentosCliente, useSubirDocumento, useReemplazarDocumento,
  useEliminarDocumento, verDocumento, type DocumentoMeta,
} from './hooks';
import { fecha } from '@/lib/format';
import { EstadoVacio, IconosVacio } from '@/components/ui/EstadoVacio';

// Categorías que el usuario PUEDE subir desde el perfil del cliente (documentación personal).
// Los comprobantes de pago y soportes de desembolso NO están aquí: pertenecen al crédito.
const CATEGORIAS = [
  { v: 'CEDULA_FRONTAL', t: 'Cédula (frontal)' },
  { v: 'CEDULA_POSTERIOR', t: 'Cédula (posterior)' },
  { v: 'CARTA_LABORAL', t: 'Carta laboral' },
  { v: 'SOPORTE_INGRESOS', t: 'Soporte de ingresos' },
  { v: 'PAGARE', t: 'Pagaré' },
  { v: 'OTRO', t: 'Otro' },
];
// Etiquetas para MOSTRAR cualquier categoría (incluye las que ya no son subibles aquí).
const ETIQUETAS_TODAS: Record<string, string> = {
  CEDULA_FRONTAL: 'Cédula (frontal)', CEDULA_POSTERIOR: 'Cédula (posterior)',
  CARTA_LABORAL: 'Carta laboral', SOPORTE_INGRESOS: 'Soporte de ingresos',
  PAGARE: 'Pagaré', COMPROBANTE_PAGO: 'Comprobante de pago',
  SOPORTE_DESEMBOLSO: 'Soporte de desembolso', OTRO: 'Otro',
};
const ETIQUETA = (v: string) => ETIQUETAS_TODAS[v] ?? v;

async function leerArchivo(file: File): Promise<{ base64: string; mime: string; nombre: string }> {
  const base64 = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] ?? '');
    r.onerror = () => rej(new Error('No se pudo leer el archivo'));
    r.readAsDataURL(file);
  });
  return { base64, mime: file.type || 'application/octet-stream', nombre: file.name };
}

function pesoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function GestorDocumentos({ clienteId }: { clienteId: number }) {
  const { data: docs, isLoading } = useDocumentosCliente(clienteId);
  const subir = useSubirDocumento(clienteId);
  const [categoria, setCategoria] = useState('CEDULA_FRONTAL');
  const [error, setError] = useState<string | null>(null);
  const inputNuevo = useRef<HTMLInputElement>(null);

  const onSubir = async (file: File) => {
    setError(null);
    try {
      const { base64, mime, nombre } = await leerArchivo(file);
      subir.mutate({ categoria, nombre_original: nombre, mime, contenido_base64: base64 });
    } catch {
      setError('No se pudo cargar el archivo.');
    }
  };

  return (
    <div className="card card-pad">
      <h4 className="mb-3 font-semibold">Documentos soporte</h4>

      {/* Subir nuevo */}
      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Categoría</span>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="input">
            {CATEGORIAS.map((c) => <option key={c.v} value={c.v}>{c.t}</option>)}
          </select>
        </label>
        <input ref={inputNuevo} type="file" accept="image/*,application/pdf" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onSubir(f); e.target.value = ''; }} />
        <button onClick={() => inputNuevo.current?.click()} disabled={subir.isPending}
          className="btn-primary btn-sm">
          {subir.isPending ? 'Subiendo…' : 'Subir documento'}
        </button>
      </div>
      {error && <p className="mb-2 text-xs text-rose-600">{error}</p>}

      {isLoading ? (
        <p className="text-sm text-slate-500">Cargando documentos…</p>
      ) : !docs || docs.length === 0 ? (
        <EstadoVacio icono={IconosVacio.documento} titulo="Sin documentos" descripcion="Este cliente aún no tiene documentos cargados. Usa el botón de arriba para subir el primero." />
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => <FilaDocumento key={d.id} clienteId={clienteId} doc={d} />)}
        </ul>
      )}
    </div>
  );
}

function FilaDocumento({ clienteId, doc }: { clienteId: number; doc: DocumentoMeta }) {
  const reemplazar = useReemplazarDocumento(clienteId);
  const eliminar = useEliminarDocumento(clienteId);
  const [confirmar, setConfirmar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputReemplazo = useRef<HTMLInputElement>(null);

  const abrir = async () => {
    setError(null);
    try {
      const d = await verDocumento(clienteId, doc.id);
      const win = window.open();
      if (win) {
        if (d.mime.startsWith('image/')) {
          win.document.write(`<img src="data:${d.mime};base64,${d.contenido_base64}" style="max-width:100%"/>`);
        } else {
          win.location.href = `data:${d.mime};base64,${d.contenido_base64}`;
        }
      }
    } catch { setError('No se pudo abrir el documento.'); }
  };

  const descargar = async () => {
    setError(null);
    try {
      const d = await verDocumento(clienteId, doc.id);
      const a = document.createElement('a');
      a.href = `data:${d.mime};base64,${d.contenido_base64}`;
      a.download = d.nombre_original;
      document.body.appendChild(a); a.click(); a.remove();
    } catch { setError('No se pudo descargar.'); }
  };

  const onReemplazar = async (file: File) => {
    setError(null);
    try {
      const { base64, mime, nombre } = await leerArchivo(file);
      reemplazar.mutate({ id: doc.id, nombre_original: nombre, mime, contenido_base64: base64 });
    } catch { setError('No se pudo reemplazar.'); }
  };

  return (
    <li className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-slate-700">{ETIQUETA(doc.categoria)}</div>
          <div className="truncate text-xs text-slate-400">
            {doc.nombre_original} · {pesoLegible(doc.tamano_bytes)} · {fecha(doc.created_at)}
            {doc.subido_por ? ` · ${doc.subido_por}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button onClick={abrir} className="font-medium text-brand hover:underline">Ver</button>
          <button onClick={descargar} className="font-medium text-brand hover:underline">Descargar</button>
          <input ref={inputReemplazo} type="file" accept="image/*,application/pdf" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onReemplazar(f); e.target.value = ''; }} />
          <button onClick={() => inputReemplazo.current?.click()} disabled={reemplazar.isPending}
            className="font-medium text-amber-600 hover:underline disabled:opacity-50">
            {reemplazar.isPending ? '…' : 'Reemplazar'}
          </button>
          {!confirmar ? (
            <button onClick={() => setConfirmar(true)} className="font-medium text-rose-600 hover:underline">Eliminar</button>
          ) : (
            <span className="flex items-center gap-1">
              <button onClick={() => eliminar.mutate(doc.id)} disabled={eliminar.isPending}
                className="font-medium text-rose-700 hover:underline">Confirmar</button>
              <button onClick={() => setConfirmar(false)} className="text-slate-400 hover:underline">✕</button>
            </span>
          )}
        </div>
      </div>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </li>
  );
}

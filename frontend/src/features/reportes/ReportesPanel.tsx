import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { api } from '@/lib/api/client';
import { money } from '@/lib/format';

type Fila = Record<string, unknown>;

const REPORTES = [
  { id: 'cartera', t: 'Cartera' },
  { id: 'pagos', t: 'Pagos' },
  { id: 'mora', t: 'Mora' },
] as const;
type ReporteId = (typeof REPORTES)[number]['id'];

const COLUMNAS: Record<ReporteId, Array<{ k: string; t: string; dinero?: boolean }>> = {
  cartera: [
    { k: 'numero_credito', t: 'N° crédito' },
    { k: 'cliente', t: 'Cliente' },
    { k: 'documento', t: 'Documento' },
    { k: 'cobrador', t: 'Cobrador' },
    { k: 'area', t: 'Área' },
    { k: 'modalidad', t: 'Modalidad' },
    { k: 'capital', t: 'Capital', dinero: true },
    { k: 'total', t: 'Total deuda', dinero: true },
    { k: 'pagado', t: 'Pagado', dinero: true },
    { k: 'saldo', t: 'Saldo', dinero: true },
    { k: 'vencido', t: 'Vencido', dinero: true },
    { k: 'estado', t: 'Estado' },
  ],
  pagos: [
    { k: 'fecha', t: 'Fecha' },
    { k: 'numero_credito', t: 'N° crédito' },
    { k: 'cliente', t: 'Cliente' },
    { k: 'valor', t: 'Valor', dinero: true },
    { k: 'metodo', t: 'Medio' },
    { k: 'registrado_por', t: 'Registrado por' },
    { k: 'observaciones', t: 'Observaciones' },
  ],
  mora: [
    { k: 'numero_credito', t: 'N° crédito' },
    { k: 'cliente', t: 'Cliente' },
    { k: 'telefono', t: 'Teléfono' },
    { k: 'cobrador', t: 'Cobrador' },
    { k: 'area', t: 'Área' },
    { k: 'numero_cuota', t: 'Cuota' },
    { k: 'fecha_vencimiento', t: 'Vencía' },
    { k: 'valor_pendiente', t: 'Pendiente', dinero: true },
    { k: 'dias_mora', t: 'Días de mora' },
  ],
};

function hoyISO() { return new Date().toISOString().slice(0, 10); }
function haceUnMesISO() {
  const d = new Date(); d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}

export function ReportesPanel() {
  const [tipo, setTipo] = useState<ReporteId>('cartera');
  const [desde, setDesde] = useState(haceUnMesISO());
  const [hasta, setHasta] = useState(hoyISO());

  const { data, isLoading, isError } = useQuery({
    queryKey: ['reporte', tipo, tipo === 'pagos' ? desde : '', tipo === 'pagos' ? hasta : ''],
    queryFn: async () => {
      const params = tipo === 'pagos' ? { params: { desde, hasta } } : undefined;
      const r = await api.get<{ data: Fila[]; total?: number }>(`/reportes/${tipo}`, params);
      return r.data;
    },
  });

  const filas = data?.data ?? [];
  const cols = COLUMNAS[tipo];

  const exportar = () => {
    const hoja = filas.map((f) => {
      const fila: Record<string, unknown> = {};
      for (const c of cols) fila[c.t] = f[c.k] ?? '';
      return fila;
    });
    const ws = XLSX.utils.json_to_sheet(hoja);
    const wb = XLSX.utils.book_new();
    const nombreHoja = REPORTES.find((r) => r.id === tipo)?.t ?? 'Reporte';
    XLSX.utils.book_append_sheet(wb, ws, nombreHoja);
    const sufijo = tipo === 'pagos' ? `_${desde}_a_${hasta}` : `_${hoyISO()}`;
    XLSX.writeFile(wb, `reporte_${tipo}${sufijo}.xlsx`);
  };

  return (
    <div>
      <h2 className="mb-1 text-xl font-bold">Reportes</h2>
      <p className="mb-5 text-sm text-slate-500">Consulta la cartera, los pagos y la mora, y expórtalos a Excel.</p>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex rounded-xl bg-slate-100 p-1">
          {REPORTES.map((r) => (
            <button key={r.id} onClick={() => setTipo(r.id)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
                tipo === r.id ? 'bg-white text-ink shadow-card' : 'text-slate-500 hover:text-ink'
              }`}>
              {r.t}
            </button>
          ))}
        </div>

        {tipo === 'pagos' && (
          <>
            <label className="text-sm">
              <span className="block text-slate-500">Desde</span>
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="input" />
            </label>
            <label className="text-sm">
              <span className="block text-slate-500">Hasta</span>
              <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="input" />
            </label>
          </>
        )}

        <button onClick={exportar} disabled={filas.length === 0} className="btn-money btn-sm ml-auto">
          Exportar a Excel ({filas.length})
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">Cargando reporte…</p>
      ) : isError ? (
        <p className="alert-error">No se pudo cargar el reporte. Intenta de nuevo.</p>
      ) : filas.length === 0 ? (
        <p className="card card-pad border-2 border-dashed border-slate-200 text-center text-sm text-slate-500 shadow-none ring-0">
          No hay datos para este reporte.
        </p>
      ) : (
        <>
          {typeof data?.total === 'number' && (
            <p className="mb-3 text-sm text-slate-600">
              Total: <b>{money(data.total)}</b> · {filas.length} registro{filas.length === 1 ? '' : 's'}
            </p>
          )}
          <div className="table-wrap">
            <table className="table-base">
              <thead>
                <tr>{cols.map((c) => <th key={c.k}>{c.t}</th>)}</tr>
              </thead>
              <tbody>
                {filas.map((f, i) => (
                  <tr key={i} className="border-t">
                    {cols.map((c) => (
                      <td key={c.k} className={c.dinero ? 'whitespace-nowrap text-right' : ''}>
                        {c.dinero ? money(Number(f[c.k] ?? 0)) : String(f[c.k] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

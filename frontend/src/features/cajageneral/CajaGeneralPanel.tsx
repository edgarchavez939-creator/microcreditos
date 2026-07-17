import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import * as XLSX from 'xlsx';
import { api } from '@/lib/api/client';
import { money, fecha, fechaHora, aMiles } from '@/lib/format';
import { useToast } from '@/components/ui/Toast';
import { EscalaMoneda } from '@/components/ui/EscalaMoneda';

interface CajaDia {
  id: number; estado: string; rol_usuario?: string; usuario?: string;
  base_inicial: number; cobros_efectivo: number; cobros_transferencia: number;
  recaudo_seguros: number; total_desembolsos: number; total_gastos: number;
  movimiento_total: number; efectivo_esperado: number; efectivo_contado?: number;
  efectivo_entregado?: number; diferencia?: number; diferencia_entrega?: number;
  observacion?: string; observacion_entrega?: string;
  hora_apertura?: string; hora_cierre?: string;
}
interface EstadoGeneral {
  fecha: string; cajas: CajaDia[];
  totales: Record<string, number>;
  conteo: Record<string, number>;
  puede_cerrar: boolean; ya_consolidado: boolean;
}

const ESTADO_INFO: Record<string, { txt: string; cls: string }> = {
  CERRADA: { txt: 'Cerrada', cls: 'bg-slate-100 text-slate-600' },
  PENDIENTE_ENTREGA: { txt: 'Pendiente de entrega', cls: 'bg-amber-50 text-amber-800' },
  RECIBIDA: { txt: 'Recibida', cls: 'bg-money-50 text-money-700' },
  CONSOLIDADA: { txt: 'Consolidada', cls: 'bg-brand-50 text-brand-700' },
};

export function CajaGeneralPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ['caja-general'],
    queryFn: async () => (await api.get<{ data: EstadoGeneral }>('/caja-general/estado')).data.data,
    refetchInterval: 20_000,
  });
  const [confirmacion, setConfirmacion] = useState('');
  const [obsGeneral, setObsGeneral] = useState('');

  const cerrar = useMutation({
    mutationFn: async () => (await api.post('/caja-general/cerrar', { confirmacion, observaciones: obsGeneral || undefined })).data,
    onSuccess: () => { toast.exito('Cierre General realizado ✓'); setConfirmacion(''); setObsGeneral(''); qc.invalidateQueries({ queryKey: ['caja-general'] }); qc.invalidateQueries({ queryKey: ['caja-general-hist'] }); },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo cerrar.'),
  });

  if (isLoading || !data) {
    return (
      <div>
        <div className="page-header"><div className="flex items-center gap-3"><h2 className="page-title">Caja General</h2><EscalaMoneda /></div><p className="page-subtitle">Consolidación del cierre del negocio.</p></div>
        <p className="text-sm text-slate-400">Cargando…</p>
      </div>
    );
  }

  const t = data.totales;
  const c = data.conteo;
  const hayDiferencias = data.cajas.some((k) => Math.abs(k.diferencia_entrega ?? 0) >= 0.01 || Math.abs(k.diferencia ?? 0) >= 0.01);

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h2 className="page-title">Caja General</h2>
          <p className="page-subtitle">Consolidación oficial del {fecha(data.fecha)}.</p>
        </div>
        <button onClick={() => exportarExcel(data)} className="btn-outline btn-sm">Exportar Excel</button>
      </div>

      {/* Conteo de cajas por estado */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ['Abiertas', c.abiertas, 'text-slate-600'],
          ['Cerradas', c.cerradas, 'text-slate-600'],
          ['Pendientes', c.pendientes, 'text-amber-700'],
          ['Recibidas', c.recibidas, 'text-money-700'],
          ['Consolidadas', c.consolidadas, 'text-brand-700'],
        ].map(([label, val, cls]) => (
          <div key={label as string} className="card card-pad text-center">
            <div className={`font-display text-2xl font-bold ${cls}`}>{val as number}</div>
            <div className="text-xs text-slate-500">{label as string}</div>
          </div>
        ))}
      </div>

      {/* Totales consolidados */}
      <div className="card card-pad mb-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Totales consolidados (desde cierres individuales)</h3>
        <div className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['Base inicial', t.base_inicial], ['Cobros efectivo', t.cobros_efectivo],
            ['Cobros transferencia', t.cobros_transferencia], ['Recaudo seguros', t.recaudo_seguros],
            ['Desembolsos', t.desembolsos], ['Gastos', t.gastos],
            ['Movimiento total', t.movimiento_total], ['Efectivo esperado', t.efectivo_esperado],
            ['Efectivo recibido', t.efectivo_recibido],
          ].map(([label, val]) => (
            <div key={label as string} className="flex justify-between border-b border-slate-50 py-1 text-sm">
              <span className="text-slate-500">{label as string}</span>
              <span className="font-medium tabular-nums">{money(val as number)}</span>
            </div>
          ))}
          <div className="flex justify-between py-1 text-sm sm:col-span-2 lg:col-span-3">
            <span className="font-semibold text-slate-700">Diferencia general</span>
            <span className={`font-bold tabular-nums ${Math.abs(t.diferencia) >= 0.01 ? (t.diferencia < 0 ? 'text-rose-600' : 'text-amber-700') : 'text-money-700'}`}>
              {money(t.diferencia)}
            </span>
          </div>
        </div>
      </div>

      {/* Detalle por caja con recepción */}
      <div className="mb-5">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Cajas individuales del día</h3>
        {data.cajas.length === 0 ? (
          <p className="rounded-xl bg-slate-50 py-6 text-center text-sm text-slate-400">Aún no hay cajas cerradas hoy.</p>
        ) : (
          <div className="space-y-2">
            {data.cajas.map((caja) => <FilaCaja key={caja.id} caja={caja} />)}
          </div>
        )}
      </div>

      {/* Cierre General */}
      <div className="card card-pad">
        <h3 className="text-sm font-semibold text-slate-700">Cierre General del negocio</h3>
        {data.ya_consolidado ? (
          <p className="mt-2 rounded-xl bg-brand-50 px-3.5 py-2.5 text-sm text-brand-700">El cierre general de hoy ya fue realizado.</p>
        ) : (
          <>
            {c.abiertas > 0 || c.pendientes > 0 ? (
              <p className="mt-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
                No es posible cerrar: hay {c.abiertas} caja(s) abierta(s) y {c.pendientes} pendiente(s) de entrega.
              </p>
            ) : (
              <>
                {hayDiferencias && (
                  <p className="mt-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
                    ⚠ Hay cajas con diferencias de efectivo. Revísalas antes de consolidar. Puedes continuar y dejar la novedad registrada.
                  </p>
                )}
                <p className="mt-3 text-sm text-slate-500">Para confirmar, escribe exactamente <b>CIERRE GENERAL</b>:</p>
                <input value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} className="input mt-1 max-w-xs" placeholder="CIERRE GENERAL" />
                <textarea value={obsGeneral} onChange={(e) => setObsGeneral(e.target.value)} className="input mt-2" rows={2} placeholder="Observaciones del cierre (opcional)" />
                <button
                  onClick={() => cerrar.mutate()}
                  disabled={confirmacion !== 'CIERRE GENERAL' || cerrar.isPending || !data.puede_cerrar}
                  className="btn-primary btn-sm mt-3">
                  {cerrar.isPending && <span className="spinner" />}
                  {cerrar.isPending ? 'Cerrando…' : 'Cerrar Caja General'}
                </button>
              </>
            )}
          </>
        )}
      </div>

      <HistorialGenerales />
    </div>
  );
}

function FilaCaja({ caja }: { caja: CajaDia }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [abierto, setAbierto] = useState(false);
  const [entregado, setEntregado] = useState('');
  const [obs, setObs] = useState('');
  const info = ESTADO_INFO[caja.estado] ?? { txt: caja.estado, cls: 'bg-slate-100 text-slate-600' };

  const recibir = useMutation({
    mutationFn: async () => (await api.post(`/caja-general/recibir/${caja.id}`, { efectivo_entregado: Number(entregado), observacion: obs || undefined })).data,
    onSuccess: () => { toast.exito('Caja recibida ✓'); qc.invalidateQueries({ queryKey: ['caja-general'] }); },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo recibir.'),
  });

  const puedeRecibir = caja.estado === 'PENDIENTE_ENTREGA' || caja.estado === 'CERRADA';

  return (
    <div className="card card-pad">
      <div className="flex cursor-pointer items-center justify-between" onClick={() => setAbierto((v) => !v)}>
        <div>
          <span className="font-medium text-slate-700">{caja.usuario ?? '—'}</span>
          <span className="ml-2 text-xs text-slate-400">{caja.rol_usuario?.toLowerCase()}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm tabular-nums text-slate-600">{money(caja.efectivo_esperado)}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs ${info.cls}`}>{info.txt}</span>
          <span className="text-slate-300">{abierto ? '▲' : '▼'}</span>
        </div>
      </div>

      {abierto && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ['Apertura', caja.hora_apertura ? fechaHora(caja.hora_apertura) : '—'],
              ['Cierre', caja.hora_cierre ? fechaHora(caja.hora_cierre) : '—'],
              ['Base inicial', money(caja.base_inicial)],
              ['Cobros efectivo', money(caja.cobros_efectivo)],
              ['Cobros transferencia', money(caja.cobros_transferencia)],
              ['Recaudo seguros', money(caja.recaudo_seguros)],
              ['Desembolsos', money(caja.total_desembolsos)],
              ['Gastos', money(caja.total_gastos)],
              ['Efectivo esperado', money(caja.efectivo_esperado)],
            ].map(([l, v]) => (
              <div key={l as string} className="flex justify-between py-0.5 text-sm">
                <span className="text-slate-500">{l as string}</span><span className="font-medium tabular-nums">{v as string}</span>
              </div>
            ))}
          </div>
          {caja.observacion && <p className="mt-2 text-xs text-slate-500">Obs. cierre: {caja.observacion}</p>}
          {caja.estado === 'RECIBIDA' && (
            <p className="mt-2 text-sm text-money-700">
              Recibido: {money(caja.efectivo_entregado ?? 0)}
              {Math.abs(caja.diferencia_entrega ?? 0) >= 0.01 && <span className={caja.diferencia_entrega! < 0 ? 'text-rose-600' : 'text-amber-700'}> · Dif. {money(caja.diferencia_entrega ?? 0)}</span>}
            </p>
          )}

          {puedeRecibir && (
            <div className="mt-3 rounded-xl bg-slate-50 p-3">
              <p className="mb-2 text-xs font-semibold text-slate-600">Confirmar recepción del dinero</p>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="label text-xs">Efectivo entregado</label>
                  <input type="number" value={entregado} onChange={(e) => setEntregado(e.target.value)} className="input py-1 text-sm" placeholder={String(caja.efectivo_esperado)} />
                </div>
                <input value={obs} onChange={(e) => setObs(e.target.value)} className="input flex-1 py-1 text-sm" placeholder="Observación (opcional)" />
                <button onClick={() => recibir.mutate()} disabled={recibir.isPending || entregado === ''} className="btn-primary btn-sm">
                  {recibir.isPending && <span className="spinner" />}Marcar recibida
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HistorialGenerales() {
  const { data } = useQuery({
    queryKey: ['caja-general-hist'],
    queryFn: async () => (await api.get('/caja-general/historial')).data.data as Array<Record<string, unknown>>,
  });
  const [abierto, setAbierto] = useState(false);
  if (!data || data.length === 0) return null;
  return (
    <div className="card card-pad mt-5">
      <button onClick={() => setAbierto((v) => !v)} className="flex w-full items-center justify-between text-sm font-semibold text-slate-700">
        Historial de cierres generales ({data.length})
        <span className="text-slate-400">{abierto ? '▲' : '▼'}</span>
      </button>
      {abierto && (
        <div className="table-wrap mt-3">
          <table className="table-base">
            <thead><tr><th>Fecha</th><th>Admin</th><th>Cajas</th><th>Mov. total</th><th>Esperado</th><th>Recibido</th><th>Diferencia</th></tr></thead>
            <tbody>
              {data.map((g) => (
                <tr key={g.id as number}>
                  <td>{fecha(g.fecha as string)}</td>
                  <td>{(g.administrador as string) ?? '—'}</td>
                  <td>{g.numero_cajas as number}</td>
                  <td className="tabular-nums">{money(g.movimiento_total as number)}</td>
                  <td className="tabular-nums">{money(g.total_efectivo_esperado as number)}</td>
                  <td className="tabular-nums">{money(g.total_efectivo_recibido as number)}</td>
                  <td className={`tabular-nums ${Math.abs(g.diferencia_general as number) >= 0.01 ? 'text-rose-600' : 'text-slate-400'}`}>{money(g.diferencia_general as number)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function exportarExcel(data: EstadoGeneral) {
  const t = data.totales;
  const resumen = [
    { Concepto: 'Fecha', Valor: data.fecha },
    { Concepto: 'Cajas recibidas', Valor: data.conteo.recibidas },
    { Concepto: 'Cajas consolidadas', Valor: data.conteo.consolidadas },
    { Concepto: 'Base inicial (miles)', Valor: aMiles(t.base_inicial) },
    { Concepto: 'Base inicial (miles)', Valor: aMiles(t.base_inicial) },
    { Concepto: 'Cobros efectivo (miles)', Valor: aMiles(t.cobros_efectivo) },
    { Concepto: 'Cobros transferencia (miles)', Valor: aMiles(t.cobros_transferencia) },
    { Concepto: 'Recaudo seguros (miles)', Valor: aMiles(t.recaudo_seguros) },
    { Concepto: 'Desembolsos (miles)', Valor: aMiles(t.desembolsos) },
    { Concepto: 'Gastos (miles)', Valor: aMiles(t.gastos) },
    { Concepto: 'Movimiento total (miles)', Valor: aMiles(t.movimiento_total) },
    { Concepto: 'Efectivo esperado (miles)', Valor: aMiles(t.efectivo_esperado) },
    { Concepto: 'Efectivo recibido (miles)', Valor: aMiles(t.efectivo_recibido) },
    { Concepto: 'Diferencia general (miles)', Valor: aMiles(t.diferencia) },
  ];
  const detalle = data.cajas.map((k) => ({
    Usuario: k.usuario, Rol: k.rol_usuario, Estado: k.estado,
    'Base inicial (miles)': aMiles(k.base_inicial), 'Cobros efectivo (miles)': aMiles(k.cobros_efectivo),
    'Cobros transferencia (miles)': aMiles(k.cobros_transferencia), 'Recaudo seguros (miles)': aMiles(k.recaudo_seguros),
    'Desembolsos (miles)': aMiles(k.total_desembolsos), 'Gastos (miles)': aMiles(k.total_gastos),
    'Efectivo esperado (miles)': aMiles(k.efectivo_esperado), 'Efectivo entregado (miles)': k.efectivo_entregado != null ? aMiles(k.efectivo_entregado) : '',
    'Diferencia (miles)': (k.diferencia_entrega ?? k.diferencia) != null ? aMiles(k.diferencia_entrega ?? k.diferencia) : '',
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle), 'Detalle por caja');
  XLSX.writeFile(wb, `caja_general_${data.fecha}.xlsx`);
}

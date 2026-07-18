import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useState } from 'react';
import { api } from '@/lib/api/client';
import { money } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import { SkeletonIndicadores } from '@/components/ui/Skeleton';
import { EscalaMoneda } from '@/components/ui/EscalaMoneda';
import { KpiCard, AccionRapida, KpiIcon } from './kpis';
import { useNavStore } from '@/stores/nav';

const DashboardGraficas = lazy(() => import('./DashboardGraficas').then((m) => ({ default: m.DashboardGraficas })));

interface Indicadores {
  prestado: number; por_recaudar: number; recuperado: number; saldo_en_calle: number;
  recaudado_hoy: number;
  cobros_hoy: { cantidad: number; total: number };
  mora: { cantidad: number; total: number };
  creditos_activos: number; pendientes_aprobacion: number; exoneraciones_pendientes: number;
  kpis?: {
    indice_mora: number; cartera_riesgo_30: number; pct_cartera_riesgo: number;
    tasa_recuperacion: number; promesas_vigentes: number;
  };
}

interface Gerencial {
  ranking: { nombre: string; rol: string; recaudo: number; pagos: number }[];
  desembolsos_hoy: { cantidad: number; total: number };
  descuadres_hoy: { cantidad: number; total: number };
  cajas_pendientes: number;
  obligaciones_empleados: { empleados: number; total: number };
}

function useIndicadores(areas: number[]) {
  return useQuery({
    queryKey: ['dashboard', areas.join(',')],
    queryFn: async () => (await api.get<{ data: Indicadores }>('/dashboard', {
      params: areas.length ? { areas: areas.join(',') } : undefined,
    })).data.data,
    refetchInterval: 60_000,
  });
}

export function DashboardPanel() {
  const rol = useAuthStore((s) => s.usuario?.rol);
  if (rol === 'COBRADOR') return <DashboardCobrador />;
  if (rol === 'SUPERVISOR') return <DashboardSupervisor />;
  return <DashboardAdmin />;
}

function saludo() {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

function Cabecera({ subtitulo }: { subtitulo: string }) {
  const nombre = useAuthStore((s) => s.usuario?.nombre ?? '');
  const primerNombre = nombre.split(' ')[0];
  return (
    <div className="mb-5">
      <div className="flex items-center gap-3">
        <h2 className="page-title">{saludo()}, {primerNombre}</h2>
        <EscalaMoneda />
      </div>
      <p className="mt-0.5 text-sm text-content-muted">{subtitulo}</p>
    </div>
  );
}

function DashboardAdmin() {
  const [areas] = useState<number[]>([]);
  const { data: d, isLoading } = useIndicadores(areas);
  const { data: g } = useQuery({
    queryKey: ['dashboard-gerencial'],
    queryFn: async () => (await api.get<{ data: Gerencial }>('/dashboard/gerencial')).data.data,
    refetchInterval: 60_000,
  });
  const irA = useNavStore((s) => s.irA);

  if (isLoading || !d) return <><Cabecera subtitulo="Panorama estratégico de toda la operación." /><SkeletonIndicadores cantidad={8} /></>;

  return (
    <div>
      <Cabecera subtitulo="Panorama estratégico de toda la operación." />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard titulo="Recaudado hoy" valor={money(d.recaudado_hoy)} detalle="Pagos del día" tono="money" icon={<KpiIcon.money />} />
        <KpiCard titulo="Desembolsos hoy" valor={money(g?.desembolsos_hoy.total ?? 0)}
          detalle={`${g?.desembolsos_hoy.cantidad ?? 0} crédito(s)`} tono="brand" icon={<KpiIcon.wallet />} />
        <KpiCard titulo="En mora" valor={money(d.mora.total)} detalle={`${d.mora.cantidad} cuota(s) vencida(s)`}
          tono={d.mora.cantidad > 0 ? 'alerta' : 'neutro'} icon={<KpiIcon.alert />} />
        <KpiCard titulo="Saldo en calle" valor={money(d.saldo_en_calle)} detalle="Pendiente por cobrar" icon={<KpiIcon.trend />} />
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard titulo="Solicitudes pendientes" valor={`${d.pendientes_aprobacion}`} detalle="Esperando aprobación"
          tono={d.pendientes_aprobacion > 0 ? 'atencion' : 'neutro'} icon={<KpiIcon.doc />} onClick={() => irA('aprobaciones')} />
        <KpiCard titulo="Cajas por recibir" valor={`${g?.cajas_pendientes ?? 0}`} detalle="Tesorería del día"
          tono={(g?.cajas_pendientes ?? 0) > 0 ? 'atencion' : 'neutro'} icon={<KpiIcon.wallet />} onClick={() => irA('caja-general')} />
        <KpiCard titulo="Descuadres hoy" valor={money(g?.descuadres_hoy.total ?? 0)}
          detalle={`${g?.descuadres_hoy.cantidad ?? 0} faltante(s)`}
          tono={(g?.descuadres_hoy.cantidad ?? 0) > 0 ? 'alerta' : 'neutro'} icon={<KpiIcon.alert />} />
        <KpiCard titulo="Deuda de empleados" valor={money(g?.obligaciones_empleados.total ?? 0)}
          detalle={`${g?.obligaciones_empleados.empleados ?? 0} empleado(s)`}
          tono={(g?.obligaciones_empleados.empleados ?? 0) > 0 ? 'atencion' : 'neutro'} icon={<KpiIcon.users />} onClick={() => irA('estado-cuenta')} />
      </div>

      {d.kpis && (
        <div className="mb-5">
          <h3 className="mb-2 text-sm font-semibold text-content">Salud de la cartera</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard titulo="Índice de mora" valor={`${d.kpis.indice_mora}%`} detalle="Saldo vencido / saldo en calle"
              tono={d.kpis.indice_mora > 15 ? 'alerta' : d.kpis.indice_mora > 8 ? 'atencion' : 'positivo'} icon={<KpiIcon.alert />} />
            <KpiCard titulo="Cartera en riesgo" valor={`${d.kpis.pct_cartera_riesgo}%`} detalle={`${money(d.kpis.cartera_riesgo_30)} > 30 días`}
              tono={d.kpis.pct_cartera_riesgo > 10 ? 'alerta' : d.kpis.pct_cartera_riesgo > 5 ? 'atencion' : 'positivo'} icon={<KpiIcon.trend />} />
            <KpiCard titulo="Recuperación" valor={`${d.kpis.tasa_recuperacion}%`} detalle="Recaudado / colocado"
              tono={d.kpis.tasa_recuperacion >= 70 ? 'positivo' : 'neutro'} icon={<KpiIcon.check />} />
            <KpiCard titulo="Promesas vigentes" valor={`${d.kpis.promesas_vigentes}`} detalle="Acuerdos activos" icon={<KpiIcon.clock />} />
          </div>
        </div>
      )}

      {g && g.ranking.length > 0 && (
        <div className="mb-5">
          <h3 className="mb-2 text-sm font-semibold text-content">Ranking de recaudo del mes</h3>
          <div className="card overflow-hidden">
            {g.ranking.map((r, i) => {
              const max = g.ranking[0].recaudo || 1;
              return (
                <div key={r.nombre + i} className="flex items-center gap-3 border-b border-border-token px-4 py-2.5 last:border-0">
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${i < 3 ? 'bg-brand-100 text-brand-700' : 'bg-surface-3 text-content-muted'}`}>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-content-strong">{r.nombre}</div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.round((r.recaudo / max) * 100)}%` }} />
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold tabular-nums text-content-strong">{money(r.recaudo)}</div>
                    <div className="text-xs text-content-muted">{r.pagos} pago(s)</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-3" />}>
        <DashboardGraficas areas={areas} />
      </Suspense>
    </div>
  );
}

function DashboardSupervisor() {
  const [areas] = useState<number[]>([]);
  const { data: d, isLoading } = useIndicadores(areas);
  const irA = useNavStore((s) => s.irA);

  if (isLoading || !d) return <><Cabecera subtitulo="Tu operación del día." /><SkeletonIndicadores cantidad={6} /></>;

  return (
    <div>
      <Cabecera subtitulo="Resumen operativo de tus áreas." />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard titulo="Solicitudes por aprobar" valor={`${d.pendientes_aprobacion}`} detalle="Requieren tu decisión"
          tono={d.pendientes_aprobacion > 0 ? 'atencion' : 'neutro'} icon={<KpiIcon.doc />} onClick={() => irA('aprobaciones')} />
        <KpiCard titulo="Cobros de hoy" valor={money(d.cobros_hoy.total)} detalle={`${d.cobros_hoy.cantidad} cuota(s) vencen hoy`}
          tono="brand" icon={<KpiIcon.clock />} onClick={() => irA('ruta')} />
        <KpiCard titulo="En mora" valor={money(d.mora.total)} detalle={`${d.mora.cantidad} cuota(s) vencida(s)`}
          tono={d.mora.cantidad > 0 ? 'alerta' : 'neutro'} icon={<KpiIcon.alert />} onClick={() => irA('mora')} />
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard titulo="Recaudado hoy" valor={money(d.recaudado_hoy)} detalle="Pagos del día" tono="money" icon={<KpiIcon.money />} />
        <KpiCard titulo="Créditos activos" valor={`${d.creditos_activos}`} detalle="En curso" icon={<KpiIcon.wallet />} />
        <KpiCard titulo="Saldo en calle" valor={money(d.saldo_en_calle)} detalle="Pendiente por cobrar" icon={<KpiIcon.trend />} />
        <KpiCard titulo="Promesas vigentes" valor={`${d.kpis?.promesas_vigentes ?? 0}`} detalle="Acuerdos activos" icon={<KpiIcon.clock />} />
      </div>

      {d.kpis && (
        <div className="mb-5 grid gap-4 sm:grid-cols-3">
          <KpiCard titulo="Índice de mora" valor={`${d.kpis.indice_mora}%`} detalle="De tus áreas"
            tono={d.kpis.indice_mora > 15 ? 'alerta' : d.kpis.indice_mora > 8 ? 'atencion' : 'positivo'} icon={<KpiIcon.alert />} />
          <KpiCard titulo="Recuperación" valor={`${d.kpis.tasa_recuperacion}%`} detalle="Recaudado / colocado"
            tono={d.kpis.tasa_recuperacion >= 70 ? 'positivo' : 'neutro'} icon={<KpiIcon.check />} />
          <KpiCard titulo="Cartera en riesgo" valor={`${d.kpis.pct_cartera_riesgo}%`} detalle={`${money(d.kpis.cartera_riesgo_30)} > 30 días`}
            tono={d.kpis.pct_cartera_riesgo > 10 ? 'alerta' : 'positivo'} icon={<KpiIcon.trend />} />
        </div>
      )}

      <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-3" />}>
        <DashboardGraficas areas={areas} />
      </Suspense>
    </div>
  );
}

function DashboardCobrador() {
  const { data: d, isLoading } = useIndicadores([]);
  const irA = useNavStore((s) => s.irA);

  const { data: caja } = useQuery({
    queryKey: ['caja-resumen-dash'],
    queryFn: async () => (await api.get('/caja/resumen-dia')).data.data,
    refetchInterval: 60_000,
  });
  const cajaAbierta = caja?.esta_abierta;
  const cajaCerrada = caja?.ya_cerrada;

  return (
    <div>
      <Cabecera subtitulo="Tu jornada de hoy." />

      <div className="mb-5 space-y-3">
        {!cajaCerrada && !cajaAbierta && (
          <AccionRapida titulo="Abrir caja" detalle="Inicia tu jornada registrando la base"
            icon={<KpiIcon.wallet />} tono="brand" onClick={() => irA('caja')} />
        )}
        <AccionRapida titulo="Ruta del día" detalle="Clientes por visitar y cobrar hoy"
          icon={<KpiIcon.route />} tono="brand" onClick={() => irA('ruta')} badge={d?.cobros_hoy.cantidad} />
        {cajaAbierta && (
          <AccionRapida titulo="Cerrar caja" detalle="Cuadra y entrega el efectivo del día"
            icon={<KpiIcon.wallet />} tono="money" onClick={() => irA('caja')} />
        )}
      </div>

      {isLoading || !d ? <SkeletonIndicadores cantidad={4} /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard titulo="Cobros de hoy" valor={`${d.cobros_hoy.cantidad}`} detalle="Cuotas que vencen hoy" tono="brand" icon={<KpiIcon.clock />} />
          <KpiCard titulo="Recaudado hoy" valor={money(d.recaudado_hoy)} detalle="Lo que llevas cobrado" tono="money" icon={<KpiIcon.money />} />
          <KpiCard titulo="En mora" valor={`${d.mora.cantidad}`} detalle="Cuotas vencidas por gestionar"
            tono={d.mora.cantidad > 0 ? 'alerta' : 'positivo'} icon={<KpiIcon.alert />} />
          <KpiCard titulo="Promesas vigentes" valor={`${d.kpis?.promesas_vigentes ?? 0}`} detalle="Acuerdos con clientes" icon={<KpiIcon.check />} />
        </div>
      )}
    </div>
  );
}

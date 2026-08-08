import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { money, fecha, fechaHora } from '@/lib/format';
import { useToast } from '@/components/ui/Toast';

/**
 * CENTRO DE MONITOREO GLOBAL · Administrador Funcional Global.
 *
 * Estado de la plataforma completa: empresas, uso, licencias por vencer y salud
 * técnica. Incluye el historial de accesos en Modo Soporte, que es la rendición
 * de cuentas ante los clientes sobre cuándo entró el equipo técnico y por qué.
 */

interface Monitoreo {
  empresas: { activas: number; prueba: number; suspendidas: number; inactivas: number };
  usuarios_activos: number;
  creditos_vigentes: number;
  pagos_hoy: { cantidad: number; total: number };
  licencias_por_vencer: { id: number; nombre: string; plan: string; fecha_vencimiento: string; estado: string }[];
  soporte_activo: number;
  salud: {
    base_datos: string; tablas_protegidas: number; rol_conexion: string;
    aislamiento_en_riesgo: boolean; version: string;
  };
}

interface SesionSoporte {
  id: number; empresa: string; tecnico: string; motivo: string;
  iniciada_at: string; finalizada_at: string | null; minutos: number | null;
  acciones: number; ip: string | null;
}

export function MonitoreoPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const [verHistorial, setVerHistorial] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['plataforma-monitoreo'],
    queryFn: async () => (await api.get<{ data: Monitoreo }>('/plataforma/monitoreo')).data.data,
    refetchInterval: 60_000,
  });

  const { data: historial } = useQuery({
    queryKey: ['soporte-historial'],
    enabled: verHistorial,
    queryFn: async () => (await api.get<{ data: SesionSoporte[] }>('/plataforma/soporte/historial')).data.data,
  });

  const salirSoporte = useMutation({
    mutationFn: async () => (await api.post('/plataforma/soporte/salir')).data,
    onSuccess: (r: { message?: string }) => {
      toast.exito(r.message ?? 'Modo soporte finalizado ✓');
      qc.invalidateQueries({ queryKey: ['plataforma-monitoreo'] });
    },
  });

  if (isLoading || !data) return <p className="text-sm text-content-muted">Cargando estado de la plataforma…</p>;

  const totalEmpresas = data.empresas.activas + data.empresas.prueba + data.empresas.suspendidas + data.empresas.inactivas;

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Centro de monitoreo</h2>
        <p className="page-subtitle">Estado de la plataforma KRYPTA en tiempo real.</p>
      </div>

      {/* El aislamiento es lo primero: si falla, nada más importa */}
      {data.salud.aislamiento_en_riesgo && (
        <div className="mb-4 rounded-xl bg-estado-mora-bg px-4 py-3 text-sm text-estado-mora">
          <p className="font-semibold">El aislamiento entre empresas no está activo.</p>
          <p className="mt-0.5">
            La aplicación se conecta con el rol <b>{data.salud.rol_conexion}</b>, que ignora las
            políticas de seguridad por ser superusuario. Mientras siga así, una empresa podría
            acceder a los datos de otra. Crea un rol sin ese privilegio antes de dar de alta
            más empresas.
          </p>
        </div>
      )}

      {data.soporte_activo > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-estado-pendiente-bg px-4 py-3 text-sm text-estado-pendiente">
          <span>Hay <b>{data.soporte_activo}</b> sesión(es) de soporte abierta(s) sobre empresas cliente.</span>
          <button onClick={() => salirSoporte.mutate()} className="btn-secondary btn-sm">Finalizar mi sesión</button>
        </div>
      )}

      {/* Pulso de la plataforma */}
      <div className="mb-5 overflow-hidden rounded-3xl bg-krypta-600 text-white shadow-[0_8px_28px_rgb(15_23_42/0.18)]">
        <div className="px-5 pt-5 sm:px-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
            Recaudado hoy en toda la plataforma
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
            <span className="font-display text-dato-2xl font-bold tabular-nums tracking-tight">
              {money(data.pagos_hoy.total)}
            </span>
            <span className="text-sm text-white/45">{data.pagos_hoy.cantidad} pagos</span>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 divide-white/[0.08] border-t border-white/[0.08] sm:grid-cols-4 sm:divide-x">
          {[
            ['Empresas', totalEmpresas],
            ['Usuarios activos', data.usuarios_activos],
            ['Créditos vigentes', data.creditos_vigentes],
            ['Tablas protegidas', data.salud.tablas_protegidas],
          ].map(([t, v]) => (
            <div key={t as string} className="px-4 py-3.5 text-center">
              <p className="font-display text-dato-lg font-bold tabular-nums">{v as number}</p>
              <p className="text-[11px] text-white/55">{t as string}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Empresas por estado */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Activas', data.empresas.activas, 'text-estado-activo'],
          ['En prueba', data.empresas.prueba, 'text-estado-info'],
          ['Suspendidas', data.empresas.suspendidas, 'text-estado-pendiente'],
          ['Inactivas', data.empresas.inactivas, 'text-estado-inactivo'],
        ].map(([t, v, cls]) => (
          <div key={t as string} className="card card-pad text-center">
            <p className={`font-display text-dato-lg font-bold tabular-nums ${cls}`}>{v as number}</p>
            <p className="text-xs text-content-muted">{t as string}</p>
          </div>
        ))}
      </div>

      {/* Licencias próximas a vencer */}
      {data.licencias_por_vencer.length > 0 && (
        <div className="card card-pad mb-5">
          <h3 className="mb-2 text-sm font-semibold text-content-strong">
            Licencias que vencen en los próximos 30 días
          </h3>
          <div className="space-y-1">
            {data.licencias_por_vencer.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                <span className="font-medium text-content-strong">{l.nombre}</span>
                <span className="text-xs text-content-muted">
                  {l.plan} · vence <b className="text-estado-pendiente">{fecha(l.fecha_vencimiento)}</b>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Historial de soporte */}
      <div className="card card-pad">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-content-strong">Accesos en Modo Soporte</h3>
          <button onClick={() => setVerHistorial(!verHistorial)} className="btn-secondary btn-sm">
            {verHistorial ? 'Ocultar' : 'Ver historial'}
          </button>
        </div>
        <p className="mt-1 text-xs text-content-muted">
          Registro de cada entrada del equipo técnico a una empresa cliente.
        </p>

        {verHistorial && (
          <div className="mt-3 space-y-2">
            {historial?.map((s) => (
              <div key={s.id} className={`rounded-xl px-3 py-2.5 ring-1 ${
                s.finalizada_at ? 'ring-border-token' : 'bg-estado-pendiente-bg ring-estado-pendiente/20'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-content-strong">{s.empresa}</span>
                  <span className="text-xs text-content-muted">
                    {s.finalizada_at
                      ? <>{s.minutos} min · {s.acciones} acciones</>
                      : <b className="text-estado-pendiente">En curso</b>}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-content-muted">
                  {s.tecnico} · {fechaHora(s.iniciada_at)}{s.ip && ` · ${s.ip}`}
                </p>
                <p className="mt-1 text-xs italic text-content">"{s.motivo}"</p>
              </div>
            ))}
            {historial?.length === 0 && (
              <p className="py-4 text-center text-xs text-content-muted">
                Nunca se ha accedido a una empresa en modo soporte.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

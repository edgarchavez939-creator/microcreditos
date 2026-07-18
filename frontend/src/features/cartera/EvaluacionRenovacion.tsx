import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api/client';
import { money } from '@/lib/format';

interface Scoring {
  elegible: boolean;
  motivo?: string;
  score?: number;
  nivel?: 'EXCELENTE' | 'BUENO' | 'REGULAR' | 'RIESGOSO';
  recomendacion?: string;
  cupo_sugerido?: number;
  monto_credito_actual?: number;
  fecha_cancelacion?: string | null;
  dias_desde_cancelacion?: number | null;
  variables?: {
    cuotas_pagadas: number;
    pct_puntualidad: number;
    max_dias_mora: number;
    gestiones_mora: number;
    creditos_completados: number;
  };
}

const NIVEL_INFO: Record<string, { cls: string; barra: string }> = {
  EXCELENTE: { cls: 'bg-money-50 text-money-700 ring-money-100', barra: 'bg-money-500' },
  BUENO: { cls: 'bg-brand-50 text-brand-700 ring-brand-100', barra: 'bg-brand-500' },
  REGULAR: { cls: 'bg-amber-50 text-amber-800 ring-amber-100', barra: 'bg-amber-500' },
  RIESGOSO: { cls: 'bg-rose-50 text-rose-700 ring-rose-100', barra: 'bg-rose-500' },
};

/** Evaluación de renovación con scoring de comportamiento de pago. */
export function EvaluacionRenovacion({ creditoId }: { creditoId: number }) {
  const [evaluar, setEvaluar] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['scoring-renovacion', creditoId],
    queryFn: async () => (await api.get<{ data: Scoring }>(`/solicitudes/${creditoId}/evaluar-renovacion`)).data.data,
    enabled: evaluar,
  });

  if (!evaluar) {
    return (
      <button onClick={() => setEvaluar(true)} className="btn-outline btn-sm">
        Evaluar renovación
      </button>
    );
  }
  if (isLoading) return <p className="text-sm text-content-muted">Calculando scoring…</p>;
  if (!data) return null;

  if (!data.elegible) {
    return <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-sm text-content-muted">{data.motivo}</p>;
  }

  const info = NIVEL_INFO[data.nivel ?? 'REGULAR'];
  const v = data.variables!;

  return (
    <div className={`animate-fade-in rounded-2xl p-4 ring-1 ${info.cls}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide opacity-70">Scoring de renovación</div>
          <div className="font-display text-2xl font-bold">{data.score} / 100 · {data.nivel}</div>
        </div>
        {data.cupo_sugerido! > 0 && (
          <div className="text-right">
            <div className="text-xs opacity-70">Cupo sugerido</div>
            <div className="font-display text-xl font-bold">{money(data.cupo_sugerido!)}</div>
          </div>
        )}
      </div>

      {/* Barra de score */}
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface/60">
        <div className={`h-full rounded-full ${info.barra}`} style={{ width: `${data.score}%` }} />
      </div>

      <p className="mt-2 text-sm font-medium">{data.recomendacion}</p>

      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
        <span>Puntualidad: <b>{v.pct_puntualidad}%</b> ({v.cuotas_pagadas} cuotas)</span>
        <span>Mora máxima: <b>{v.max_dias_mora} días</b></span>
        <span>Gestiones de cobro: <b>{v.gestiones_mora}</b></span>
        <span>Créditos completados: <b>{v.creditos_completados}</b></span>
        {data.dias_desde_cancelacion != null && (
          <span>Cancelado hace: <b>{data.dias_desde_cancelacion} día{data.dias_desde_cancelacion === 1 ? '' : 's'}</b></span>
        )}
      </div>

      <p className="mt-3 text-xs opacity-70">
        El cupo sugerido es una recomendación basada en el comportamiento de pago; la decisión final es del aprobador.
        Para renovar, crea una nueva solicitud con el monto sugerido.
      </p>
    </div>
  );
}

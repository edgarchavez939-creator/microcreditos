import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { solicitudSchema, aPayloadSolicitud, type SolicitudForm as TForm, calcularPreview, frecuenciasDe, type ProductoFinanciero } from './schema';
import { useCrearSolicitud } from './hooks';
import { money } from '@/lib/format';
import { api } from '@/lib/api/client';

const MODAL_TITULO: Record<string, string> = { MENSUAL: 'Mensual', QUINCENAL: 'Quincenal', SEMANAL: 'Semanal', DIARIO: 'Diario' };
const MODAL_LABEL: Record<string, string> = { MENSUAL: 'mensuales', QUINCENAL: 'quincenales', SEMANAL: 'semanales', DIARIO: 'diarias' };

/**
 * FORMULARIO DINÁMICO (Motor de Productos Financieros).
 * No hay formularios separados por modalidad: este único formulario se construye
 * según la configuración del producto seleccionado (tasa, seguro, valor pactado,
 * frecuencias y límites). El cálculo también depende solo de esa configuración.
 */
export function SolicitudForm({ clienteId, areaId, creditoOrigenId, onCreada }:
  { clienteId: number; areaId: number; creditoOrigenId?: number; onCreada?: () => void }) {
  const crear = useCrearSolicitud();
  const [exito, setExito] = useState(false);

  // Productos activos del motor
  const { data: productos } = useQuery({
    queryKey: ['productos-financieros-activos'],
    queryFn: async () => (await api.get<{ data: ProductoFinanciero[] }>('/productos-financieros/activos')).data.data,
  });
  const [productoId, setProductoId] = useState<number | null>(null);
  const producto = useMemo(
    () => productos?.find((p) => p.id === productoId) ?? null,
    [productos, productoId],
  );

  // Selección inicial: el primero por orden (Tradicional)
  useEffect(() => {
    if (productos?.length && productoId === null) setProductoId(productos[0].id);
  }, [productos, productoId]);

  const defaults = (p?: ProductoFinanciero | null): Partial<TForm> => ({
    cliente_id: clienteId, area_id: areaId, seguro_exonerado: false,
    porcentaje_seguro: p?.usa_seguro ? Number(p.seguro_defecto) * 100 : undefined,
    tasa_interes: p?.usa_tasa ? Number(p.tasa_defecto) * 100 : undefined,
    plazo_meses: 2,
    modalidad: (frecuenciasDe(p)[0] ?? 'MENSUAL') as TForm['modalidad'],
    producto_financiero_id: p?.id,
  });

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<TForm>({
    resolver: zodResolver(solicitudSchema),
    defaultValues: defaults(null),
  });

  // Al cambiar de producto: reajustar defaults según su configuración
  useEffect(() => {
    if (producto) {
      reset({ ...defaults(producto), capital_solicitado: watch('capital_solicitado') });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [producto?.id]);

  const valores = watch();
  const preview = calcularPreview(valores, producto);
  const exonerado = watch('seguro_exonerado');
  const modalidad = watch('modalidad');
  const frecuencias = frecuenciasDe(producto);

  const usaTasa = producto?.usa_tasa ?? true;
  const usaSeguro = producto?.usa_seguro ?? true;
  const usaPactado = producto?.usa_valor_pactado ?? false;

  const onSubmit = (data: TForm) => {
    setExito(false);
    // La marca de renovación viaja con la solicitud (el backend valida el origen)
    const payload = { ...aPayloadSolicitud(data), credito_origen_id: creditoOrigenId };
    crear.mutate(payload, {
      onSuccess: () => {
        setExito(true);
        reset(defaults(producto));
        onCreada?.();
      },
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card card-pad space-y-4 max-w-lg">
      {exito && (
        <div className="rounded-xl bg-money-50 px-4 py-3 text-sm text-money-700 ring-1 ring-money-100">
          Solicitud creada con éxito. Quedó pendiente de aprobación.
        </div>
      )}

      {/* SELECTOR DE PRODUCTO (motor de productos) */}
      {productos && productos.length > 1 && (
        <div>
          <label className="label">Producto de crédito</label>
          <div className="grid grid-cols-2 gap-2">
            {productos.map((p) => (
              <button type="button" key={p.id} onClick={() => setProductoId(p.id)}
                className={`rounded-xl border-2 p-3 text-left transition ${p.id === productoId ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'}`}
                style={p.id === productoId && p.color ? { borderColor: p.color } : undefined}>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: p.color ?? '#4F46E5' }} />
                  <span className="text-sm font-semibold text-slate-800">{p.nombre}</span>
                </div>
                {p.descripcion && <p className="mt-1 text-xs text-slate-500 line-clamp-2">{p.descripcion}</p>}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="label">Capital solicitado <span className="font-normal text-slate-400">(en pesos)</span></label>
        <input type="number" step="any" {...register('capital_solicitado', { valueAsNumber: true })} className="input" placeholder="Ej: 1000000" />
        <p className="mt-1 text-xs text-slate-400">
          {usaPactado
            ? 'El capital que se entrega al cliente.'
            : 'Escribe el valor en pesos completos (ej: 1.000.000). El capital aprobado lo definirá quien apruebe la solicitud.'}
        </p>
      </div>

      {/* VALOR PACTADO: solo productos que lo manejan (ej. Al Bate) */}
      {usaPactado && (
        <div>
          <label className="label">Valor total pactado <span className="font-normal text-slate-400">(en pesos)</span></label>
          <input type="number" step="any" {...register('valor_pactado', { valueAsNumber: true })} className="input" placeholder="Ej: 1200000" />
          <p className="mt-1 text-xs text-slate-400">El valor total que el cliente se compromete a pagar. La cuota será este valor dividido en el número de cuotas.</p>
          {errors.valor_pactado && <p className="field-error">{errors.valor_pactado.message}</p>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {/* TASA: solo productos que la usan */}
        {usaTasa && (
          <div>
            <label className="label">Tasa interés mensual (%)</label>
            <input type="number" step="0.1" {...register('tasa_interes', { valueAsNumber: true })} className="input"
              disabled={producto ? !producto.permite_modificar_tasa : false} />
            <p className="mt-1 text-xs text-slate-400">
              {producto && !producto.permite_modificar_tasa ? 'Tasa fija del producto' : 'Ej: 10 = 10%'}
            </p>
          </div>
        )}
        <div>
          <label className="label">Plazo (meses)</label>
          <input type="number" min="1" {...register('plazo_meses', { valueAsNumber: true })} className="input" />
        </div>
      </div>

      <div>
        <label className="label">Modalidad de pago</label>
        <select {...register('modalidad')} className="input">
          {frecuencias.map((m) => <option key={m} value={m}>{MODAL_TITULO[m] ?? m}</option>)}
        </select>
      </div>

      {/* Simulación estimada del plan según la configuración del producto */}
      <div className="rounded-xl bg-brand-50 p-4 text-sm ring-1 ring-brand-100">
        <div className="font-semibold text-brand-700">Plan estimado {producto ? `· ${producto.nombre}` : ''}</div>
        <div className="mt-1 text-slate-700">
          {preview.numeroCuotas > 0 && preview.totalRecaudar > 0
            ? <>{preview.numeroCuotas} cuotas {MODAL_LABEL[modalidad]} de <b>{money(preview.cuota)}</b></>
            : 'Completa los valores para ver el plan estimado.'}
        </div>
      </div>

      {/* SEGURO: solo productos que lo usan */}
      {usaSeguro && (
        <>
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register('seguro_exonerado')} />
            <span className="text-sm">Exonerar seguro (requiere aprobación de Administrador)</span>
          </label>

          {!exonerado ? (
            <div>
              <label className="label">% Seguro (5–10)</label>
              <input type="number" step="0.1" {...register('porcentaje_seguro', { valueAsNumber: true })} className="input"
                disabled={producto ? !producto.permite_modificar_seguro : false} />
              <p className="mt-1 text-xs text-slate-400">
                {producto && !producto.permite_modificar_seguro ? 'Seguro fijo del producto' : 'Ej: 8 = 8%'}
              </p>
              {errors.porcentaje_seguro && <p className="field-error">{errors.porcentaje_seguro.message}</p>}
            </div>
          ) : (
            <div>
              <label className="label">Motivo de exoneración</label>
              <textarea {...register('motivo_exoneracion')} className="input" />
              {errors.motivo_exoneracion && <p className="field-error">{errors.motivo_exoneracion.message}</p>}
            </div>
          )}
        </>
      )}

      <div className="rounded-xl bg-slate-50 p-4 text-sm space-y-1.5 ring-1 ring-slate-100">
        {usaSeguro && <div className="flex justify-between"><span>Valor seguro</span><b>{money(preview.valorSeguro)}</b></div>}
        <div className="flex justify-between"><span>Monto desembolsado (neto)</span><b>{money(preview.desembolsado)}</b></div>
        {usaPactado
          ? <div className="flex justify-between"><span>Diferencia pactado − capital</span><b>{money(preview.interes)}</b></div>
          : usaTasa && <div className="flex justify-between"><span>Intereses (sobre aprobado)</span><b>{money(preview.interes)}</b></div>}
        <div className="flex justify-between"><span className="font-medium text-slate-700">Total a recaudar</span><b>{money(preview.totalRecaudar)}</b></div>
        <div className="flex justify-between"><span>Valor cuota</span><b>{money(preview.cuota)}</b></div>
      </div>

      <button type="submit" disabled={crear.isPending} className="btn-primary">
        {crear.isPending ? 'Guardando…' : 'Crear solicitud'}
      </button>
    </form>
  );
}

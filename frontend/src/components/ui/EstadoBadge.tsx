import { EstadoSolicitud } from '@/types';

/**
 * ESTADO DEL CRÉDITO.
 *
 * Los quince estados del negocio se expresan con solo SIETE colores, los mismos
 * de toda la plataforma. Antes cada estado tenía su propio tono (ámbar, naranja,
 * índigo, cian, violeta, púrpura…) y una lista de créditos parecía un semáforo
 * roto: el usuario terminaba leyendo cada etiqueta igualmente.
 *
 * Ahora el color responde a una sola pregunta —¿esto está bien, requiere acción,
 * o está cerrado?— y el texto precisa el resto.
 */

type Tono = 'activo' | 'info' | 'pendiente' | 'mora' | 'validacion' | 'inactivo' | 'bloqueado';

const TONOS: Record<Tono, string> = {
  activo:     'bg-estado-activo-bg text-estado-activo',
  info:       'bg-estado-info-bg text-estado-info',
  pendiente:  'bg-estado-pendiente-bg text-estado-pendiente',
  mora:       'bg-estado-mora-bg text-estado-mora',
  validacion: 'bg-estado-validacion-bg text-estado-validacion',
  inactivo:   'bg-estado-inactivo-bg text-estado-inactivo',
  bloqueado:  'bg-estado-bloqueado-bg text-estado-bloqueado',
};

/** Cada estado del negocio con su significado visual y su nombre legible. */
const ESTADOS: Record<string, { tono: Tono; texto: string }> = {
  BORRADOR:                { tono: 'inactivo',   texto: 'Borrador' },
  PENDIENTE_SUPERVISOR:    { tono: 'pendiente',  texto: 'Espera supervisor' },
  PENDIENTE_ADMINISTRADOR: { tono: 'pendiente',  texto: 'Espera administrador' },
  APROBADO:                { tono: 'info',       texto: 'Aprobado' },
  RECHAZADO:               { tono: 'mora',       texto: 'Rechazado' },
  DESEMBOLSADO:            { tono: 'info',       texto: 'Desembolsado' },
  ACTIVO:                  { tono: 'activo',     texto: 'Al día' },
  MIGRADO:                 { tono: 'validacion', texto: 'Migrado' },
  EN_MORA:                 { tono: 'mora',       texto: 'En mora' },
  PAGADO:                  { tono: 'activo',     texto: 'Pagado' },
  FINALIZADO:              { tono: 'activo',     texto: 'Finalizado' },
  REAMORTIZADO:            { tono: 'validacion', texto: 'Reamortizado' },
  REFINANCIADO:            { tono: 'validacion', texto: 'Refinanciado' },
  CANCELADO:               { tono: 'inactivo',   texto: 'Cancelado' },
  CASTIGADO:               { tono: 'bloqueado',  texto: 'Castigado' },
};

export function EstadoBadge({ estado }: { estado: EstadoSolicitud }) {
  const e = ESTADOS[estado] ?? { tono: 'inactivo' as Tono, texto: String(estado).replace(/_/g, ' ') };

  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full
      px-2.5 py-1 text-xs font-medium ${TONOS[e.tono]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" aria-hidden />
      {e.texto}
    </span>
  );
}

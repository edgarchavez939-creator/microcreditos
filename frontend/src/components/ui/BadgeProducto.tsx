/**
 * COLORES POR PRODUCTO FINANCIERO — KRYPTA Business Suite.
 *
 * Cada modalidad de crédito tiene identidad propia. El color viaja con el
 * producto a todas partes: listado, perfil del cliente, historial, caja,
 * reportes y línea de tiempo. Así el usuario reconoce de qué producto habla
 * una fila sin leer su nombre.
 *
 * El color se guarda en el producto (columna `color`), de modo que el
 * administrador puede ajustarlo; esta paleta es el punto de partida oficial
 * y la que ofrece el selector.
 */

export const PALETA_PRODUCTOS = [
  { nombre: 'Azul corporativo', valor: '#2563EB' },  // Crédito Tradicional
  { nombre: 'Naranja',          valor: '#F97316' },  // Crédito Al Bate
  { nombre: 'Morado',           valor: '#7C3AED' },  // Microempresa
  { nombre: 'Turquesa',         valor: '#0D9488' },  // Libre Inversión
  { nombre: 'Azul profundo',    valor: '#1A2B5F' },  // Empresarial
  { nombre: 'Verde',            valor: '#10B981' },  // Sin interés
  { nombre: 'Rosa',             valor: '#DB2777' },
  { nombre: 'Ámbar',            valor: '#F59E0B' },
] as const;

/** Color por defecto cuando un producto aún no tiene uno asignado. */
export const COLOR_PRODUCTO_DEFECTO = '#2563EB';

/**
 * Etiqueta de producto: punto de color + nombre. Es la forma única de mostrar
 * un producto en toda la plataforma, para que se vea igual en cada módulo.
 */
export function BadgeProducto({ nombre, color, compacto }: {
  nombre?: string | null;
  color?: string | null;
  compacto?: boolean;
}) {
  if (!nombre) return <span className="text-content-muted">—</span>;
  const c = color || COLOR_PRODUCTO_DEFECTO;

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium
        ${compacto ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'}`}
      style={{ backgroundColor: `${c}14`, color: c }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c }} aria-hidden />
      {nombre}
    </span>
  );
}

/**
 * BIBLIOTECA DE COMPONENTES · punto de entrada único.
 *
 * Toda pantalla importa desde aquí:
 *     import { AppButton, AppCard, AppMoney } from '@/components/ds';
 *
 * Reglas del sistema:
 *  1. Ninguna pantalla define colores, sombras ni radios por su cuenta: si algo
 *     no se puede expresar con estos componentes, se amplía el componente, no
 *     se inventa un estilo suelto.
 *  2. Un mismo propósito, un mismo componente. Si ya existe AppTable, no se crea
 *     otra tabla; se le añade lo que falte.
 *  3. Todo componente nuevo entra por este archivo.
 *
 * Los componentes previos (Toast, Drawer, Skeleton…) se reexportan aquí para que
 * exista un solo lugar del que importar, sin tener que reescribir lo que ya
 * funciona en producción.
 */

// Primitivos
export { AppButton, AppCard, AppChip, AppAvatar, AppAlert } from './primitivos';
export type { TonoEstado } from './primitivos';

// Datos
export { AppMoney, AppDate, AppStatCard, AppSummaryCard } from './datos';

// Estructura
export { AppTable, AppTabs, AppModal, AppAccordion, AppPagination } from './estructura';
export type { ColumnaTabla } from './estructura';

// Formulario
export { AppInput, AppSelect, AppTextarea, AppFilter, AppPermissionGuard } from './formulario';

// Piezas ya existentes en producción (mismo sistema, misma puerta de entrada)
export { InputMoneda as AppCurrencyInput } from '../ui/InputMoneda';
export { Tooltip as AppTooltip } from '../ui/Tooltip';
export { Breadcrumb as AppBreadcrumb } from '../ui/Breadcrumb';
export { EstadoVacio as AppEmptyState } from '../ui/EstadoVacio';
export { Skeleton as AppSkeleton } from '../ui/Skeleton';
export { Drawer as AppDrawer } from '../ui/Drawer';
export { Timeline as AppTimeline } from '../ui/Timeline';
export { EstadoBadge as AppStatus } from '../ui/EstadoBadge';
export { EscalaMoneda as AppScaleHint } from '../ui/EscalaMoneda';

# Design System

Infraestructura visual de la plataforma. Toda pantalla nueva debe construirse con
estas piezas; ninguna debe definir colores, sombras o radios por su cuenta.

```tsx
import { AppButton, AppCard, AppMoney, AppTable } from '@/components/ds';
```

## Principios

**El dato es el contenido.** En un sistema financiero la cifra no es un adorno del
texto: es la información. Por eso los importes usan cifras tabulares (alinean dígito
con dígito en columnas), jerarquía por tamaño y no por color, y el signo nunca
compite con la magnitud.

**El color comunica, no decora.** Cada color tiene un significado fijo en toda la
plataforma. Si un elemento es ámbar, está pendiente. Siempre.

| Token | Color | Significado |
|---|---|---|
| `estado-activo` | verde | Al día, operación exitosa |
| `estado-info` | azul | Información neutra |
| `estado-pendiente` | ámbar | Requiere acción, en espera |
| `estado-mora` | rojo | Vencido, faltante, error |
| `estado-validacion` | morado | En proceso de validación |
| `estado-inactivo` | gris | Deshabilitado, sin actividad |
| `estado-bloqueado` | negro | Cerrado a cambios |

**Legible sin leer.** `AppCard` con la propiedad `estado` pinta una banda lateral de
color. Un cobrador que recorre 40 clientes distingue mora de al-día por el borde,
sin detenerse a leer cada tarjeta.

**Primero el móvil, y en serio.** La app se usa a pleno sol, con una mano y con
prisa. Los controles respetan 44px de área táctil (WCAG 2.5.5), los campos usan
16px mínimo para que iOS no haga zoom al enfocar, y `AppTable` cambia de forma:
tarjetas apiladas en el teléfono, tabla real en escritorio.

## Componentes

**Primitivos** — `AppButton` (tonos: primario, secundario, dinero, peligro,
fantasma), `AppCard`, `AppChip`, `AppAvatar`, `AppAlert`.

**Datos** — `AppMoney`, `AppDate`, `AppStatCard`, `AppSummaryCard`.

**Estructura** — `AppTable`, `AppTabs`, `AppModal`, `AppAccordion`, `AppPagination`.

**Formulario** — `AppInput`, `AppSelect`, `AppTextarea`, `AppCurrencyInput`,
`AppFilter`, `AppPermissionGuard`.

**Ya en producción** — `AppTooltip`, `AppBreadcrumb`, `AppEmptyState`,
`AppSkeleton`, `AppDrawer`, `AppTimeline`, `AppStatus`, `AppScaleHint`.

## Ejemplos

```tsx
// Importe con jerarquía. Un faltante se pinta solo.
<AppMoney valor={saldo} peso="titular" />
<AppMoney valor={diferencia} />          // negativo → rojo automático

// Resumen de caja: distingue lo que suma de lo informativo
<AppSummaryCard
  titulo="Cierre del día"
  lineas={[
    { etiqueta: 'Base inicial', valor: 200000, direccion: 'entra' },
    { etiqueta: 'Cobros en efectivo', valor: 450000, direccion: 'entra' },
    { etiqueta: 'Cobros por transferencia', valor: 150000, direccion: 'entra', informativa: true },
    { etiqueta: 'Gastos', valor: 50000, direccion: 'sale' },
  ]}
  total={{ etiqueta: 'Efectivo esperado', valor: 600000 }}
/>

// Tabla que se adapta sola al móvil
<AppTable
  columnas={[
    { clave: 'cliente', titulo: 'Cliente', principal: true },
    { clave: 'saldo', titulo: 'Saldo', alinear: 'der', ordenable: true,
      render: (f) => <AppMoney valor={f.saldo} /> },
    { clave: 'area', titulo: 'Área', principal: false },   // se oculta en móvil
  ]}
  filas={creditos}
  onFila={(f) => abrirCredito(f.id)}
/>
```

## Reglas de contribución

1. Un propósito, un componente. Si existe `AppTable`, no se crea otra tabla:
   se le añade lo que falte.
2. Todo componente nuevo se exporta desde `components/ds/index.ts`.
3. Nada de estilos en línea ni colores literales en las pantallas.
4. Si una pieza necesita un color que no está en los tokens, primero se discute
   si el significado ya existe con otro nombre.

## Escala tipográfica

Los tamaños `dato-*` (de `dato-xs` a `dato-2xl`) son para cifras: llevan
interlineado ajustado y espaciado entre letras negativo porque un número se lee de
un vistazo, no como prosa. El texto normal usa la escala estándar de Tailwind.

## Modo oscuro

Ya funciona. Los tokens `surface`, `content` y `border-token` cambian de valor
según el tema; usarlos en vez de `bg-white` o `text-slate-900` es lo que hace que
una pantalla nueva soporte el modo oscuro sin trabajo extra.

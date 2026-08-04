/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Navegación / superficies profundas
        // Fondo oscuro corporativo: sidebar, header y paneles de cabecera.
        ink: { DEFAULT: '#0F172A', 700: '#152037', 600: '#1C2842', 500: '#26314F' },
        // Primario de acción (índigo de confianza). DEFAULT mantiene compat con bg-brand.
        // ============ IDENTIDAD KRYPTA BUSINESS SUITE ============
        // Primario: azul profundo. Sidebar, header, botones principales, marca.
        // Es el color del producto en reposo: serio, estable, de confianza.
        krypta: {
          DEFAULT: '#1A2B5F', 50: '#F1F4FA', 100: '#DDE4F2', 200: '#B9C6E3',
          300: '#8DA1CE', 400: '#5C77B4', 500: '#334E92', 600: '#1A2B5F',
          700: '#152449', 800: '#101B37', 900: '#0B1226',
        },
        // Secundario: azul eléctrico. Acción, foco, enlaces, estados activos.
        // Es el color del producto en movimiento.
        brand: {
          DEFAULT: '#2563EB', 50: '#EFF6FF', 100: '#DBEAFE', 200: '#BFDBFE',
          300: '#93C5FD', 400: '#60A5FA', 500: '#3B82F6', 600: '#2563EB', 700: '#1D4ED8',
        },
        // Éxito. Nunca como color principal (así lo define la marca).
        money: { DEFAULT: '#10B981', 50: '#ECFDF5', 100: '#D1FAE5', 400: '#34D399', 500: '#10B981', 600: '#059669', 700: '#047857' },

        // --- TOKENS SEMÁNTICOS (Design System) ---
        // Cambian de valor entre modo claro y oscuro vía variables CSS. Úsalos en vez
        // de bg-white / text-slate-900 para que el dark mode sea automático.
        surface: 'rgb(var(--surface) / <alpha-value>)',        // fondo de tarjetas
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',  // fondo de la app / zonas hundidas
        'surface-3': 'rgb(var(--surface-3) / <alpha-value>)',  // hover / franjas
        'border-token': 'rgb(var(--border) / <alpha-value>)',
        'divider': 'rgb(var(--divider) / <alpha-value>)',
        'selected': 'rgb(var(--selected) / <alpha-value>)',
        'content-strong': 'rgb(var(--content-strong) / <alpha-value>)', // títulos
        'content': 'rgb(var(--content) / <alpha-value>)',      // texto normal
        'content-muted': 'rgb(var(--content-muted) / <alpha-value>)',   // secundario

        // --- COLORES FUNCIONALES (el color comunica, no decora) ---
        // Cada uno tiene un significado fijo en TODA la plataforma.
        // Cada estado es una PAREJA: un fondo pastel y un texto del mismo matiz.
        // El color informa de un vistazo sin saturar la pantalla, y el texto
        // conserva contraste AA. Se adaptan solos al modo oscuro.
        estado: {
          'activo':         'rgb(var(--pastel-activo-fg) / <alpha-value>)',
          'activo-bg':      'rgb(var(--pastel-activo-bg) / <alpha-value>)',
          'info':           'rgb(var(--pastel-info-fg) / <alpha-value>)',
          'info-bg':        'rgb(var(--pastel-info-bg) / <alpha-value>)',
          'pendiente':      'rgb(var(--pastel-pendiente-fg) / <alpha-value>)',
          'pendiente-bg':   'rgb(var(--pastel-pendiente-bg) / <alpha-value>)',
          'mora':           'rgb(var(--pastel-mora-fg) / <alpha-value>)',
          'mora-bg':        'rgb(var(--pastel-mora-bg) / <alpha-value>)',
          'validacion':     'rgb(var(--pastel-validacion-fg) / <alpha-value>)',
          'validacion-bg':  'rgb(var(--pastel-validacion-bg) / <alpha-value>)',
          'inactivo':       'rgb(var(--pastel-inactivo-fg) / <alpha-value>)',
          'inactivo-bg':    'rgb(var(--pastel-inactivo-bg) / <alpha-value>)',
          'bloqueado':      'rgb(var(--pastel-bloqueado-fg) / <alpha-value>)',
          'bloqueado-bg':   'rgb(var(--pastel-bloqueado-bg) / <alpha-value>)',
        },
      },
      fontFamily: {
        // Las familias las elige el administrador funcional; estas variables
        // se actualizan en caliente al aplicar la identidad.
        sans: ['var(--fuente-texto)', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--fuente-titulos)', 'Sora', 'Inter', 'ui-sans-serif', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)',
        soft: '0 4px 20px -4px rgba(16,24,40,.10), 0 2px 8px -4px rgba(16,24,40,.06)',
        lift: '0 12px 32px -8px rgba(16,24,40,.18)',
      },
      // GRADIENTE CORPORATIVO KRYPTA: profundo → eléctrico → éxito.
      // Representa los tres pilares del isotipo (flujo, conexión, crecimiento).
      // Reservado a login, splash y piezas institucionales; nunca como fondo de trabajo.
      backgroundImage: {
        'krypta': 'linear-gradient(135deg, #1A2B5F 0%, #2563EB 55%, #10B981 100%)',
        'krypta-suave': 'linear-gradient(135deg, #1A2B5F 0%, #2563EB 100%)',
      },

      borderRadius: { xl: '0.875rem', '2xl': '1.125rem', '3xl': '1.5rem' },

      // ESCALA TIPOGRÁFICA. Los tamaños de dato llevan interlineado ajustado
      // porque las cifras se leen de un vistazo, no se "leen" como prosa.
      fontSize: {
        'dato-xs':  ['0.75rem',  { lineHeight: '1rem',    letterSpacing: '0' }],
        'dato-sm':  ['0.875rem', { lineHeight: '1.25rem', letterSpacing: '-0.006em' }],
        'dato':     ['1.125rem', { lineHeight: '1.5rem',  letterSpacing: '-0.012em' }],
        'dato-lg':  ['1.5rem',   { lineHeight: '1.75rem', letterSpacing: '-0.02em' }],
        'dato-xl':  ['2rem',     { lineHeight: '2.25rem', letterSpacing: '-0.025em' }],
        'dato-2xl': ['2.75rem',  { lineHeight: '3rem',    letterSpacing: '-0.03em' }],
      },

      // Área táctil mínima para uso en campo (WCAG 2.5.5: 44px).
      spacing: { touch: '2.75rem' },
      minHeight: { touch: '2.75rem' },
      minWidth:  { touch: '2.75rem' },

      // ELEVACIONES: cada nivel corresponde a una distancia real del plano.
      zIndex: { base: '0', sticky: '20', drawer: '40', modal: '50', toast: '60', tooltip: '70' },

      transitionDuration: { rapido: '120ms', normal: '200ms', pausado: '320ms' },
      transitionTimingFunction: { salida: 'cubic-bezier(.16,1,.3,1)' },

      keyframes: {
        'entrada-suave': { '0%': { opacity: '0', transform: 'translateY(4px)' }, '100%': { opacity: '1', transform: 'none' } },
      },
      animation: { 'entrada-suave': 'entrada-suave .2s cubic-bezier(.16,1,.3,1)' },
    },
  },
  plugins: [],
};

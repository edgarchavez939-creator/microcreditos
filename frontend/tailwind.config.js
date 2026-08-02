/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Navegación / superficies profundas
        ink: { DEFAULT: '#0B1120', 700: '#131C33', 600: '#1B2542', 500: '#26314F' },
        // Primario de acción (índigo de confianza). DEFAULT mantiene compat con bg-brand.
        brand: {
          DEFAULT: '#4F46E5', 50: '#EEF0FF', 100: '#E0E3FF', 200: '#C4C9FF',
          300: '#A1A8FB', 400: '#7C84F4', 500: '#4F46E5', 600: '#4338CA', 700: '#3730A3',
        },
        // Dinero / positivo
        money: { DEFAULT: '#059669', 50: '#ECFDF5', 100: '#D1FAE5', 400: '#34D399', 500: '#10B981', 600: '#059669', 700: '#047857' },

        // --- TOKENS SEMÁNTICOS (Design System) ---
        // Cambian de valor entre modo claro y oscuro vía variables CSS. Úsalos en vez
        // de bg-white / text-slate-900 para que el dark mode sea automático.
        surface: 'rgb(var(--surface) / <alpha-value>)',        // fondo de tarjetas
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',  // fondo de la app / zonas hundidas
        'surface-3': 'rgb(var(--surface-3) / <alpha-value>)',  // hover / franjas
        'border-token': 'rgb(var(--border) / <alpha-value>)',
        'content-strong': 'rgb(var(--content-strong) / <alpha-value>)', // títulos
        'content': 'rgb(var(--content) / <alpha-value>)',      // texto normal
        'content-muted': 'rgb(var(--content-muted) / <alpha-value>)',   // secundario

        // --- COLORES FUNCIONALES (el color comunica, no decora) ---
        // Cada uno tiene un significado fijo en TODA la plataforma.
        estado: {
          activo:     '#059669',  // verde  · crédito al día, operación exitosa
          info:       '#2563EB',  // azul   · información neutra
          pendiente:  '#D97706',  // ámbar  · requiere acción / en espera
          mora:       '#DC2626',  // rojo   · vencido, faltante, error
          validacion: '#7C3AED',  // morado · en proceso de validación
          inactivo:   '#64748B',  // gris   · deshabilitado, sin actividad
          bloqueado:  '#1E293B',  // negro  · cerrado a cambios
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Sora', 'Inter', 'ui-sans-serif', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)',
        soft: '0 4px 20px -4px rgba(16,24,40,.10), 0 2px 8px -4px rgba(16,24,40,.06)',
        lift: '0 12px 32px -8px rgba(16,24,40,.18)',
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

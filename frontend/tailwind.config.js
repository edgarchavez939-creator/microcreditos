/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
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
        money: { DEFAULT: '#059669', 50: '#ECFDF5', 100: '#D1FAE5', 600: '#059669', 700: '#047857' },
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
      borderRadius: { xl: '0.875rem', '2xl': '1.125rem' },
    },
  },
  plugins: [],
};

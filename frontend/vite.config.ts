import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt'],
      manifest: {
        name: 'KRYPTA Business Suite',
        short_name: 'KRYPTA',
        description: 'Gestión de microcréditos, ventas financiadas y cobranza territorial',
        theme_color: '#1A2B5F',
        background_color: '#0F172A',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,

        // El service worker nuevo toma el control de inmediato, sin esperar a que
        // se cierren todas las pestañas. Sin esto, tras un despliegue el worker
        // viejo seguía sirviendo un index.html cacheado que apuntaba a archivos
        // .css/.js con hash antiguo (ya inexistentes): la app cargaba SIN ESTILOS
        // hasta que el usuario cerraba todas las ventanas.
        skipWaiting: true,
        clientsClaim: true,

        runtimeCaching: [
          {
            // La API NUNCA se cachea: siempre red. (El caché 'NetworkFirst' anterior
            // servía respuestas viejas cuando Render tardaba >5s en arrancar en frío.)
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
          {
            // El documento se pide primero a la red, para que tras un despliegue
            // siempre se reciba el index.html que apunta a los assets vigentes.
            // Si no hay conexión, se cae al precache y la app sigue abriendo.
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'documento',
              networkTimeoutSeconds: 5,
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: true } },
  },
});

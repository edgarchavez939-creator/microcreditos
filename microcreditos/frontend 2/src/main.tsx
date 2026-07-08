import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from './components/ui/Toast';
import { App } from './App';
import './index.css';
import { APP_VERSION } from './lib/version';

// Purga única por versión: elimina service workers y cachés viejos que
// puedan estar sirviendo datos o código antiguo (ejecuta una sola vez por versión).
const PURGA_SW = `purga-${APP_VERSION}`;
if ('serviceWorker' in navigator && !localStorage.getItem(PURGA_SW)) {
  (async () => {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
      if (window.caches) {
        const claves = await caches.keys();
        await Promise.all(claves.map((k) => caches.delete(k)));
      }
      localStorage.setItem(PURGA_SW, '1');
      if (regs.length > 0) window.location.reload();
    } catch { /* sin SW: continuar normal */ }
  })();
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </QueryClientProvider>
  </React.StrictMode>
);

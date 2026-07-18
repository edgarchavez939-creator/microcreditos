import { useEffect, useRef } from 'react';
import { api } from '@/lib/api/client';

/**
 * REPORTERO DE UBICACIÓN (cobradores y supervisores).
 * Mientras la app está abierta, envía la posición GPS al servidor cada 60 segundos
 * para el mapa territorial en vivo. Limitación de las apps web: al bloquear el
 * teléfono o cambiar de app, el navegador suspende el GPS hasta volver.
 * Silencioso: si el usuario niega el permiso o falla el GPS, no molesta.
 */
export function useReporteUbicacion(rol?: string | null) {
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const operativo = rol === 'COBRADOR' || rol === 'SUPERVISOR';
    if (!operativo || !('geolocation' in navigator)) return;

    const reportar = () => {
      // Solo con la pestaña visible (el navegador igual suspende en segundo plano)
      if (document.visibilityState !== 'visible') return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          api.post('/mapa/ubicacion', {
            latitud: pos.coords.latitude,
            longitud: pos.coords.longitude,
            precision_m: pos.coords.accuracy ?? undefined,
          }).catch(() => {/* silencioso */});
        },
        () => {/* permiso negado o sin señal: silencioso */},
        { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 },
      );
    };

    reportar(); // primer reporte al entrar
    timer.current = window.setInterval(reportar, 60000);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [rol]);
}

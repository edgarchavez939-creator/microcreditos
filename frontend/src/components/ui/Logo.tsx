import { useEffect, useState } from 'react';
import { logoPara } from '@/lib/marca';

/**
 * LOGO DE LA MARCA.
 *
 * Usa el logo que el administrador funcional haya subido, eligiendo la variante
 * correcta para el fondo sobre el que se muestra: no es lo mismo el isotipo a
 * color sobre blanco que la versión preparada para el navy del sidebar.
 *
 * Si no hay logo cargado, dibuja el isotipo de KRYPTA por defecto —tres trazos
 * que fluyen y se conectan hacia arriba: flujo, conexión y crecimiento.
 */
export function Logo({ size = 36, className = '', fondo = 'oscuro' }: {
  size?: number;
  className?: string;
  /** Fondo sobre el que se dibuja: determina la variante que se usa. */
  fondo?: 'claro' | 'oscuro' | 'icono';
}) {
  const [src, setSrc] = useState<string | null>(() => logoPara(fondo));

  // La identidad llega de forma asíncrona al arrancar; se reintenta un momento
  // después para tomar el logo del cliente en cuanto esté disponible.
  useEffect(() => {
    if (src) return;
    const t = setTimeout(() => setSrc(logoPara(fondo)), 600);
    return () => clearTimeout(t);
  }, [src, fondo]);

  if (src) {
    return (
      <img src={src} width={size} height={size} alt="" aria-hidden
        className={`object-contain ${className}`} style={{ width: size, height: size }} />
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}
      xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id="kryptaGrad" x1="0" y1="48" x2="48" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1A2B5F" />
          <stop offset="0.55" stopColor="#2563EB" />
          <stop offset="1" stopColor="#10B981" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill="url(#kryptaGrad)" />
      {/* Tres trazos que ascienden y convergen: flujo, conexión, crecimiento */}
      <path d="M14 33c4-2 6-5 7-9s3-7 7-9" stroke="white" strokeOpacity="0.55"
        strokeWidth="2.6" strokeLinecap="round" />
      <path d="M14 33c6-1 10-4 12-9s5-8 8-9" stroke="white" strokeOpacity="0.8"
        strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="34" cy="15" r="3.4" fill="white" />
    </svg>
  );
}

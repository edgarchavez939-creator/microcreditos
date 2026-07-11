import { api } from '@/lib/api/client';

/** Aclara/oscurece un color hex por un factor (-1..1). */
function ajustar(hex: string, factor: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const num = parseInt(full, 16);
  let r = (num >> 16) & 0xff, g = (num >> 8) & 0xff, b = num & 0xff;
  if (factor >= 0) {
    r = Math.round(r + (255 - r) * factor);
    g = Math.round(g + (255 - g) * factor);
    b = Math.round(b + (255 - b) * factor);
  } else {
    const f = 1 + factor;
    r = Math.round(r * f); g = Math.round(g * f); b = Math.round(b * f);
  }
  return `#${[r, g, b].map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')).join('')}`;
}

/** Aplica el color de marca como variables CSS (genera la escala 400–700). */
export function aplicarColorMarca(color: string) {
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)) return;
  const root = document.documentElement;
  root.style.setProperty('--brand-400', ajustar(color, 0.18));
  root.style.setProperty('--brand-500', color);
  root.style.setProperty('--brand-600', ajustar(color, -0.12));
  root.style.setProperty('--brand-700', ajustar(color, -0.24));
  // Activa los overrides CSS de color de marca (solo si el color difiere del default)
  if (color.toLowerCase() !== '#4f46e5') {
    root.setAttribute('data-marca', '');
  } else {
    root.removeAttribute('data-marca');
  }
}

/** Aplica el nombre de la plataforma (título del documento y elementos marcados). */
export function aplicarNombreMarca(nombre: string) {
  if (!nombre) return;
  document.title = nombre;
  document.querySelectorAll('[data-marca-nombre]').forEach((el) => { el.textContent = nombre; });
}

let marcaCargada = false;

/** Carga la marca desde el backend y la aplica. Se llama al iniciar la app. */
export async function cargarYAplicarMarca(): Promise<{ nombre: string; color: string } | null> {
  try {
    const { data } = await api.get<{ data: { nombre: string; color: string } }>('/marca-publica');
    if (data?.data) {
      aplicarColorMarca(data.data.color);
      aplicarNombreMarca(data.data.nombre);
      marcaCargada = true;
      return data.data;
    }
  } catch {
    // Si falla, se mantiene la marca por defecto (definida en CSS/config).
  }
  return null;
}

export function marcaYaCargada() { return marcaCargada; }

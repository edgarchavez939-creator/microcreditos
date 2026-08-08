import { api } from '@/lib/api/client';
import { fijarSimboloMoneda } from '@/lib/format';

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

// ============================================================================
// IDENTIDAD VISUAL COMPLETA (administrable por el Administrador Funcional)
// ============================================================================

/**
 * La versión anterior solo aplicaba nombre y color primario. Esta amplía el
 * alcance a toda la identidad: paleta completa, tipografías y logos.
 *
 * Como la aplicación consume tokens y no colores literales, cambiar un valor
 * aquí repinta las 37 pantallas sin tocar ninguna.
 */

export type VarianteLogo =
  | 'ISOTIPO_COLOR' | 'ISOTIPO_OSCURO' | 'MONO_BLANCO' | 'MONO_NEGRO' | 'APP_ICON';

export interface MarcaCompleta {
  nombre: string;
  nombre_plataforma: string;
  descriptor: string;
  color_primario: string;
  color_secundario: string;
  color_exito: string;
  color_advertencia: string;
  color_peligro: string;
  color_oscuro: string;
  color_fondo: string;
  tipografia_titulos: string;
  tipografia_texto: string;
  radio: 'recto' | 'suave' | 'redondeado';
  logos: Partial<Record<VarianteLogo, string>>;
}

/** "#1A2B5F" → "26 43 95" (formato de las variables CSS). */
function aRgb(hex: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** Deriva el fondo tenue de un estado a partir de su color. */
function haciaBlanco(hex: string, factor: number): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const f = (c: number) => Math.round(c + (255 - c) * factor);
  return `${f((n >> 16) & 255)} ${f((n >> 8) & 255)} ${f(n & 255)}`;
}

/** Tipografías disponibles y su especificación en Google Fonts. */
export const FUENTES: Record<string, string> = {
  'Inter': 'Inter:wght@400;500;600;700',
  'Manrope': 'Manrope:wght@400;500;600;700;800',
  'Sora': 'Sora:wght@400;600;700;800',
  'Plus Jakarta Sans': 'Plus+Jakarta+Sans:wght@400;500;600;700;800',
  'DM Sans': 'DM+Sans:wght@400;500;700',
  'Outfit': 'Outfit:wght@400;500;600;700;800',
};

const RADIOS: Record<string, string> = { recto: '0.25rem', suave: '0.625rem', redondeado: '0.875rem' };

/** Carga una familia de Google Fonts (una sola vez por familia). */
export function cargarFuente(familia: string) {
  const spec = FUENTES[familia];
  if (!spec) return;
  const id = `fuente-${familia.replace(/\s+/g, '-')}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id; link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${spec}&display=swap`;
  document.head.appendChild(link);
}

/** Aplica la identidad completa sobre las variables CSS del documento. */
export function aplicarIdentidad(m: Partial<MarcaCompleta>) {
  const raiz = document.documentElement;
  const set = (prop: string, val: string | null) => { if (val) raiz.style.setProperty(prop, val); };

  // Primario: marco de la aplicación (sidebar, header, botón principal)
  if (m.color_primario) {
    set('--marca-primario', aRgb(m.color_primario));
    aplicarColorMarca(m.color_primario);   // conserva la escala 400–700 previa
  }

  // Secundario: acción, foco, enlaces
  if (m.color_secundario) {
    set('--marca-secundario', aRgb(m.color_secundario));
    set('--pastel-info-bg', haciaBlanco(m.color_secundario, 0.86));
    set('--pastel-info-fg', aRgb(m.color_secundario));
  }

  // Estados: el fondo tenue se deriva del color elegido
  const estados: [keyof MarcaCompleta, string][] = [
    ['color_exito', 'activo'], ['color_advertencia', 'pendiente'], ['color_peligro', 'mora'],
  ];
  for (const [clave, token] of estados) {
    const hex = m[clave] as string | undefined;
    if (!hex) continue;
    set(`--pastel-${token}-bg`, haciaBlanco(hex, 0.86));
    set(`--pastel-${token}-fg`, aRgb(hex));
  }

  if (m.color_fondo) set('--surface-2', aRgb(m.color_fondo));
  if (m.color_oscuro) set('--marca-oscuro', aRgb(m.color_oscuro));

  // Tipografía
  if (m.tipografia_texto) { cargarFuente(m.tipografia_texto); set('--fuente-texto', `'${m.tipografia_texto}'`); }
  if (m.tipografia_titulos) { cargarFuente(m.tipografia_titulos); set('--fuente-titulos', `'${m.tipografia_titulos}'`); }

  // Forma de las esquinas
  if (m.radio && RADIOS[m.radio]) set('--radio-base', RADIOS[m.radio]);

  // Nombre y color del navegador
  const nombre = m.nombre_plataforma || m.nombre;
  if (nombre) {
    document.title = m.descriptor ? `${nombre} ${m.descriptor}` : nombre;
    document.querySelectorAll('[data-marca-nombre]').forEach((el) => { el.textContent = nombre; });
  }
  document.querySelectorAll('[data-marca-descriptor]').forEach((el) => {
    if (m.descriptor !== undefined) el.textContent = m.descriptor;
  });
  if (m.color_primario) {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', m.color_primario);
  }

  // Los logos quedan disponibles para el componente Logo
  if (m.logos) { identidadActual = { ...(identidadActual ?? {}), ...m } as MarcaCompleta; }
  else if (m) { identidadActual = { ...(identidadActual ?? {}), ...m } as MarcaCompleta; }
}

let identidadActual: MarcaCompleta | null = null;
export function marcaActual(): MarcaCompleta | null { return identidadActual; }

/** Devuelve el logo adecuado al fondo sobre el que se mostrará. */
export function logoPara(fondo: 'claro' | 'oscuro' | 'icono'): string | null {
  const l = identidadActual?.logos;
  if (!l) return null;
  if (fondo === 'icono') return l.APP_ICON ?? l.ISOTIPO_COLOR ?? null;
  if (fondo === 'oscuro') return l.ISOTIPO_OSCURO ?? l.MONO_BLANCO ?? l.ISOTIPO_COLOR ?? null;
  return l.ISOTIPO_COLOR ?? l.MONO_NEGRO ?? null;
}

/** Carga la identidad completa y la aplica. Reemplaza a cargarYAplicarMarca. */
export async function cargarIdentidad(): Promise<MarcaCompleta | null> {
  try {
    const { data } = await api.get<{ data: MarcaCompleta }>('/marca-publica');
    if (data?.data) {
      identidadActual = data.data;
      aplicarIdentidad(data.data);
      marcaCargada = true;
      return data.data;
    }
  } catch {
    // Sin conexión o error: se conserva la identidad de fábrica del CSS.
  }
  return null;
}

/**
 * Carga la identidad de MI EMPRESA (requiere sesión activa).
 *
 * La identidad pública es la de KRYPTA, porque en la pantalla de acceso todavía
 * no se sabe quién entra. En cuanto hay sesión, cada empresa ve su propia marca:
 * sus colores, su tipografía y su logo.
 */
export async function cargarIdentidadEmpresa(): Promise<MarcaCompleta | null> {
  try {
    const { data } = await api.get<{ data: MarcaCompleta & { empresa?: DatosEmpresa } }>('/mi-marca');
    if (data?.data) {
      identidadActual = data.data;
      empresaActual = data.data.empresa ?? null;
      // Cada empresa puede operar en su propia moneda
      if (empresaActual?.simbolo_moneda) fijarSimboloMoneda(empresaActual.simbolo_moneda);
      aplicarIdentidad(data.data);
      return data.data;
    }
  } catch {
    // Sin conexión: se conserva la identidad ya aplicada.
  }
  return null;
}

export interface DatosEmpresa {
  id: number; nombre: string; moneda: string; simbolo_moneda: string;
  zona_horaria: string; formato_fecha: string; estado: string;
}

let empresaActual: DatosEmpresa | null = null;

/** Datos de la empresa en sesión (moneda, formato de fecha, nombre). */
export function empresaEnSesion(): DatosEmpresa | null { return empresaActual; }

/** Al cerrar sesión se vuelve a la identidad de la plataforma. */
export function restablecerIdentidadPlataforma(): void {
  empresaActual = null;
  identidadActual = null;
  cargarIdentidad();
}

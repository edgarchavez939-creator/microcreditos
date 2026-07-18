import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Tema = 'light' | 'dark' | 'system';

interface TemaState {
  tema: Tema;
  setTema: (t: Tema) => void;
}

/** Aplica el tema al <html> (clase .dark), resolviendo 'system' con la preferencia del SO. */
export function aplicarTema(tema: Tema) {
  const root = document.documentElement;
  const oscuro = tema === 'dark' || (tema === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark', oscuro);
  root.style.colorScheme = oscuro ? 'dark' : 'light';
}

export const useTemaStore = create<TemaState>()(
  persist(
    (set) => ({
      tema: 'system',
      setTema: (t) => { set({ tema: t }); aplicarTema(t); },
    }),
    {
      name: 'tema',
      onRehydrateStorage: () => (state) => {
        // Al cargar, aplicar el tema guardado
        aplicarTema(state?.tema ?? 'system');
      },
    },
  ),
);

// Si el usuario está en 'system', reaccionar a cambios del SO en vivo
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const { tema } = useTemaStore.getState();
    if (tema === 'system') aplicarTema('system');
  });
}

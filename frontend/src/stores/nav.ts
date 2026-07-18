import { create } from 'zustand';

/**
 * Navegación global entre módulos. Permite que cualquier pantalla (por ejemplo, una
 * tarjeta del dashboard) lleve al usuario a otro módulo sin prop-drilling.
 * El AppShell sincroniza su módulo activo con este store.
 */
interface NavState {
  modulo: string;
  irA: (modulo: string) => void;
  setModulo: (modulo: string) => void;
}

export const useNavStore = create<NavState>((set) => ({
  modulo: 'inicio',
  irA: (modulo) => set({ modulo }),
  setModulo: (modulo) => set({ modulo }),
}));

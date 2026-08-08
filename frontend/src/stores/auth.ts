import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import axios from 'axios';
import { cargarIdentidadEmpresa, restablecerIdentidadPlataforma } from '@/lib/marca';
import { API_BASE } from '@/lib/api/config';
import type { Usuario } from '@/types';

interface AuthState {
  usuario: Usuario | null;
  accessToken: string | null;
  refreshToken: string | null;
  login: (email: string, password: string, otp?: string) => Promise<void>;
  loginGoogle: (idToken: string, otp?: string) => Promise<void>;
  refresh: () => Promise<string | null>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      usuario: null,
      accessToken: null,
      refreshToken: null,

      async login(email, password, otp) {
        const { data } = await axios.post(`${API_BASE}/auth/login`, { email, password, otp });
        set({
          usuario: data.usuario,
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
        });
        // Cada empresa ve su propia identidad visual desde el primer instante.
        cargarIdentidadEmpresa();
      },

      // Ingreso con Google: el navegador ya obtuvo el id_token; el backend lo
      // valida y devuelve exactamente la misma sesión que el login normal.
      async loginGoogle(idToken, otp) {
        const { data } = await axios.post(`${API_BASE}/auth/login/google`, { id_token: idToken, otp });
        set({
          usuario: data.usuario,
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
        });
        // Cada empresa ve su propia identidad visual desde el primer instante.
        cargarIdentidadEmpresa();
      },

      async refresh() {
        const rt = get().refreshToken;
        if (!rt) return null;
        try {
          const { data } = await axios.post(`${API_BASE}/auth/refresh`, { refresh_token: rt });
          set({ accessToken: data.access_token, refreshToken: data.refresh_token });
          return data.access_token as string;
        } catch {
          get().logout();
          return null;
        }
      },

      logout() {
        set({ usuario: null, accessToken: null, refreshToken: null });
        restablecerIdentidadPlataforma();
      },
    }),
    { name: 'auth' }
  )
);

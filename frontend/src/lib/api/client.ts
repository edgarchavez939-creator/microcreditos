import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/auth';
import { API_BASE } from '@/lib/api/config';
import { encolarOffline } from '@/lib/api/offlineQueue';

export const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  // Timeout generoso: el plan gratuito de Render puede tardar ~40s en el primer
  // arranque (cold start). 60s da margen sin colgar indefinidamente si algo falla.
  timeout: 60_000,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // Anti-caché: cada GET lleva un parámetro único para que ningún caché
  // (service worker viejo, navegador o proxy) pueda servir datos antiguos.
  if ((config.method ?? 'get').toLowerCase() === 'get') {
    config.params = { ...(config.params ?? {}), _t: Date.now() };
  }
  return config;
});

let refreshing: Promise<string | null> | null = null;

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (!error.response && original && ['post', 'put', 'patch'].includes(original.method ?? '')) {
      await encolarOffline(original);
      return Promise.reject(new Error('OFFLINE_ENCOLADO'));
    }
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      refreshing ??= useAuthStore.getState().refresh();
      const nuevo = await refreshing;
      refreshing = null;
      if (nuevo) {
        original.headers.Authorization = `Bearer ${nuevo}`;
        return api(original);
      }
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);

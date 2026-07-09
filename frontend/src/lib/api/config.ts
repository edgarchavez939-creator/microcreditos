// En desarrollo: '/api' pasa por el proxy de Vite hacia el backend local.
// En producción (Vercel): define VITE_API_URL = https://TU-API.onrender.com/api
export const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

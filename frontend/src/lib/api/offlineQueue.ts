import { openDB } from 'idb';
import type { InternalAxiosRequestConfig } from 'axios';
import { api } from '@/lib/api/client';

const DB = 'microcreditos-offline';
const STORE = 'cola';

async function db() {
  return openDB(DB, 1, {
    upgrade(d) { d.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true }); },
  });
}

export async function encolarOffline(req: InternalAxiosRequestConfig) {
  const d = await db();
  await d.add(STORE, { url: req.url, method: req.method, data: req.data, ts: Date.now() });
}

export async function sincronizar() {
  const d = await db();
  const pendientes = await d.getAll(STORE);
  for (const item of pendientes) {
    try {
      await api.request({ url: item.url, method: item.method, data: item.data });
      await d.delete(STORE, item.id);
    } catch { /* reintento futuro */ }
  }
}

window.addEventListener('online', () => { void sincronizar(); });

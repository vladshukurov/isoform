import type { Scene } from './model';

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? response.statusText);
  return data;
}

export const loadScenes = () => call<{ scenes: { name: string; scene: Scene }[]; siteArtDir: string }>('/api/scenes');
export const saveScene = (name: string, scene: Scene) =>
  call(`/api/scenes/${encodeURIComponent(name)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(scene) });
export const exportToSite = (name: string) => call<{ files: string[] }>(`/api/export/${encodeURIComponent(name)}`, { method: 'POST' });

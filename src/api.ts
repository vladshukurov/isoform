import type { Scene } from './model';

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? response.statusText);
  return data;
}

type Entry = { name: string; scene: Scene };
const json = (method: string, value: unknown): RequestInit =>
  ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
const file = (name: string) => `/api/files/${encodeURIComponent(name)}`;

export const loadLibrary = () => call<{ root: string; files: Entry[]; templates: Entry[] }>('/api/library');
export const readFile = (name: string) => call<{ scene: Scene }>(file(name)).then(r => r.scene);
export const saveFile = (name: string, scene: Scene) => call(file(name), json('PUT', scene));
export const renameFile = (name: string, to: string) => call(`${file(name)}/rename`, json('POST', { to }));
export const deleteFile = (name: string) => call(file(name), { method: 'DELETE' });

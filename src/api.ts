// Storage for scenes. With the dev server files live in files/ on disk;
// in a static build (no server) they live in this browser and the
// templates ship inside the bundle.
import { formatScene } from './format';
import { validateScene, type Scene } from './model';

type Entry = { name: string; scene: Scene };
export type Activity = { tool: string; file?: string; at: number };
export type Library = { root: string; node?: string; files: Entry[]; templates: Entry[]; broken?: { name: string; error: string }[]; mcp?: Activity | null; local: boolean };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? response.statusText);
  return data;
}
const json = (method: string, value: unknown): RequestInit =>
  ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
const file = (name: string) => `/api/files/${encodeURIComponent(name)}`;

const bundled = import.meta.glob<Scene>('../templates/*.json', { eager: true, import: 'default' });
const bundledTemplates = (): Entry[] => Object.entries(bundled)
  .map(([path, scene]) => ({ name: path.match(/([\w-]+)\.json$/)![1], scene: validateScene(scene) }))
  .sort((a, b) => a.name.localeCompare(b.name));

// Browser storage, one key per file so a broken entry can't take the rest down.
const PREFIX = 'isoform:file:';
const local = {
  list(): Entry[] {
    const out: Entry[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!;
        if (!key.startsWith(PREFIX)) continue;
        try { out.push({ name: key.slice(PREFIX.length), scene: validateScene(JSON.parse(localStorage.getItem(key)!)) }); } catch { /* skip broken */ }
      }
    } catch { /* storage blocked */ }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
  save(name: string, scene: Scene) {
    try { localStorage.setItem(PREFIX + name, formatScene(scene)); }
    catch { throw new Error('Браузер не даёт сохранить файл — проверьте, что сайт не в приватном режиме'); }
  },
  remove(name: string) { try { localStorage.removeItem(PREFIX + name); } catch { /* ignore */ } },
};

let offline = false;

export async function loadLibrary(): Promise<Library> {
  try {
    const library = await call<Omit<Library, 'local'>>('/api/library');
    return { ...library, local: false };
  } catch {
    offline = true;
    return { root: '', files: local.list(), templates: bundledTemplates(), local: true };
  }
}

// Tell the dev server what's open, so an agent (MCP get_editor_state) can see it.
export const publishState = (state: { file: string | null; selection: string[]; mode: string }) => {
  if (!offline) fetch('/api/state', json('POST', state)).catch(() => undefined);
};

export const readFile = async (name: string) => (await call<{ scene: Scene }>(file(name))).scene;

// keepalive lets a save finish while the page is closing.
export async function saveFile(name: string, scene: Scene, keepalive = false) {
  if (offline) return local.save(name, scene);
  await call(file(name), { ...json('PUT', scene), keepalive });
}
export async function renameFile(name: string, to: string) {
  if (!offline) return void await call(`${file(name)}/rename`, json('POST', { to }));
  const scene = local.list().find(e => e.name === name)?.scene;
  if (scene) { local.save(to, scene); local.remove(name); }
}
export async function deleteFile(name: string) {
  if (offline) return local.remove(name);
  await call(file(name), { method: 'DELETE' });
}

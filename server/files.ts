// Your scenes live as files in files/, the site's scenes as read-only
// templates in templates/; both are versioned with the project.
import { existsSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatScene } from '../src/format';
import { validateScene, type Scene } from '../src/model';

export const root = resolve(import.meta.dirname, '..');
// Where files/ and previews/ are: the project, or a sandbox of its own for a
// run that shouldn't touch your files (npm run eval).
export const work = process.env.ISOFORM_WORKSPACE ? resolve(process.env.ISOFORM_WORKSPACE) : root;
export const dirs = { files: resolve(work, 'files'), templates: resolve(root, 'templates'), previews: resolve(work, 'previews') };

export const validName = (name: unknown): name is string => typeof name === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(name);
const pathOf = (name: string) => {
  if (!validName(name)) throw new Error(`Имя «${name}»: латиница, цифры и дефис`);
  return resolve(dirs.files, `${name}.json`);
};

// A file that doesn't parse (an agent mid-write) is reported, not fatal.
export function list(kind: 'files' | 'templates') {
  const scenes: { name: string; scene: Scene }[] = [], broken: { name: string; error: string }[] = [];
  for (const f of readdirSync(dirs[kind]).filter(f => f.endsWith('.json')).sort()) {
    const name = f.slice(0, -5);
    try { scenes.push({ name, scene: validateScene(JSON.parse(readFileSync(resolve(dirs[kind], f), 'utf8'))) }); }
    catch (error) { broken.push({ name, error: (error as Error).message }); }
  }
  return { scenes, broken };
}

export const readFile = (name: string) => validateScene(JSON.parse(readFileSync(pathOf(name), 'utf8')));
export const saveFile = (name: string, scene: unknown) => writeFileSync(pathOf(name), formatScene(validateScene(scene)));

export function renameFile(name: string, next: string) {
  if (existsSync(pathOf(next))) throw new Error(`Файл ${next} уже есть`);
  renameSync(pathOf(name), pathOf(next));
}

export const deleteFile = (name: string) => unlinkSync(pathOf(name));

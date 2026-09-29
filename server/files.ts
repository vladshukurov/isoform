// Your scenes live as files in files/, the site's scenes as read-only
// templates in templates/; both are versioned with the project.
import { existsSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatScene } from '../src/format';
import { validateScene } from '../src/model';

export const root = resolve(import.meta.dirname, '..');
export const dirs = { files: resolve(root, 'files'), templates: resolve(root, 'templates') };

export const validName = (name: string) => /^[a-z0-9][a-z0-9-]*$/.test(name);
const pathOf = (name: string) => {
  if (!validName(name)) throw new Error(`Имя «${name}»: латиница, цифры и дефис`);
  return resolve(dirs.files, `${name}.json`);
};

export function list(kind: keyof typeof dirs) {
  return readdirSync(dirs[kind]).filter(f => f.endsWith('.json')).sort()
    .map(f => ({ name: f.slice(0, -5), scene: validateScene(JSON.parse(readFileSync(resolve(dirs[kind], f), 'utf8'))) }));
}

export const readFile = (name: string) => validateScene(JSON.parse(readFileSync(pathOf(name), 'utf8')));
export const saveFile = (name: string, scene: unknown) => writeFileSync(pathOf(name), formatScene(validateScene(scene)));

export function renameFile(name: string, next: string) {
  if (existsSync(pathOf(next))) throw new Error(`Файл ${next} уже есть`);
  renameSync(pathOf(name), pathOf(next));
}

export const deleteFile = (name: string) => unlinkSync(pathOf(name));

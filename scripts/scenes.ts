// Which scenes a script works on: every file in files/, or the names given.
// `templates/<name>` picks a template instead of a user file.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dirs, root } from '../server/files';
import { validateScene } from '../src/model';

export { dirs, root };

export type Target = { name: string; path: string };

export function targets(args: string[]): Target[] {
  if (!args.length) return readdirSync(dirs.files).filter(f => f.endsWith('.json'))
    .map(f => ({ name: f.slice(0, -5), path: resolve(dirs.files, f) }));
  return args.map(arg => {
    const name = arg.replace(/\.json$/, '').replace(/^files\//, '');
    const path = name.startsWith('templates/') ? resolve(root, `${name}.json`) : resolve(dirs.files, `${name}.json`);
    if (!existsSync(path)) { console.error(`Нет файла ${name.startsWith('templates/') ? '' : 'files/'}${name}.json`); process.exit(1); }
    return { name, path };
  });
}

export const load = (t: Target) => validateScene(JSON.parse(readFileSync(t.path, 'utf8')));

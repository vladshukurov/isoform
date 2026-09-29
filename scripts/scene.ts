// Builds a scene from a recipe written with src/kit.ts:
//   npm run scene vault     recipes/vault.ts → files/vault.json
// The recipe's default export is a Scene or a function returning one.
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { formatScene } from '../src/format';
import { validateScene, type Scene } from '../src/model';
import { review } from '../src/review';
import { dirs, root } from './scenes';

const name = process.argv[2]?.replace(/^recipes\//, '').replace(/\.ts$/, '');
if (!name) { console.error('Укажите рецепт: npm run scene <имя>'); process.exit(1); }
const source = resolve(root, 'recipes', `${name}.ts`);
if (!existsSync(source)) { console.error(`Нет рецепта recipes/${name}.ts`); process.exit(1); }

const made = (await import(pathToFileURL(source).href)).default as Scene | (() => Scene);
const scene = validateScene(typeof made === 'function' ? made() : made);
const out = resolve(dirs.files, `${name}.json`);
writeFileSync(out, formatScene(scene));
const problems = review(scene);
console.log(`${problems.length ? '✗' : '✓'} files/${name}.json: блоков ${scene.objects.length}`);
for (const problem of problems) console.log(`    ${problem}`);
process.exit(problems.length ? 1 : 0);

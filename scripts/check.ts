// Checks scenes before anyone looks at them, for people and agents alike:
//   npm run check            every file in files/
//   npm run check vault      only files/vault.json
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fit } from '../src/geometry';
import { validateScene } from '../src/model';
import { review } from '../src/review';

const dir = resolve(import.meta.dirname, '../files');
const wanted = process.argv.slice(2);
const names = readdirSync(dir).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5))
  .filter(name => !wanted.length || wanted.includes(name));
if (wanted.length && !names.length) { console.error(`Нет файла files/${wanted[0]}.json`); process.exit(1); }

let failed = false;
for (const name of names) {
  let problems: string[];
  try {
    const scene = validateScene(JSON.parse(readFileSync(resolve(dir, `${name}.json`), 'utf8')));
    problems = review(scene);
    const blocks = scene.objects.filter(p => !p.hidden);
    console.log(`${problems.length ? '✗' : '✓'} ${name}: блоков ${blocks.length}, с наведением ${blocks.filter(p => p.hover).length}, силуэт ${Math.round(fit(blocks).area)}`);
  } catch (error) {
    problems = [(error as Error).message];
    console.log(`✗ ${name}`);
  }
  for (const problem of problems) console.log(`    ${problem}`);
  failed ||= problems.length > 0;
}
process.exit(failed ? 1 : 0);

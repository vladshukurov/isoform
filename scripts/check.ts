// Checks scenes before anyone looks at them, for people and agents alike:
//   npm run check                    every file in files/
//   npm run check vault              only files/vault.json
//   npm run check templates/storage  a template
// Errors (format, overlaps) fail the run; warnings ("!") only point things out.
import { fit } from '../src/geometry';
import { review } from '../src/review';
import { load, targets } from './scenes';
import { warnings } from './warnings';

let failed = false;
for (const target of targets(process.argv.slice(2))) {
  let problems: string[], notes: string[] = [];
  try {
    const scene = load(target);
    problems = review(scene);
    notes = warnings(scene);
    const blocks = scene.objects.filter(p => !p.hidden);
    console.log(`${problems.length ? '✗' : '✓'} ${target.name}: блоков ${blocks.length}, с наведением ${blocks.filter(p => p.hover).length}, силуэт ${Math.round(fit(blocks).area)}`);
  } catch (error) {
    problems = [(error as Error).message];
    console.log(`✗ ${target.name}`);
  }
  for (const problem of problems) console.log(`    ${problem}`);
  for (const note of notes) console.log(`  ! ${note}`);
  failed ||= problems.length > 0;
}
process.exit(failed ? 1 : 0);

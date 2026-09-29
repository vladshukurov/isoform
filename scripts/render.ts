// Draws scenes to PNG so an agent (or a person without the editor open) can
// look at the result: the site card at rest, halfway into the hover (delays
// and cascades show up here) and fully hovered, side by side.
//   npm run render                    every file in files/ → previews/<name>.png
//   npm run render vault              only files/vault.json
//   npm run render templates/storage  a template → previews/templates/storage.png
//   npm run render vault --focus=lid,base   the rest of the scene faded, to judge one detail
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { previewSvg } from '../src/preview';
import { load, root, targets } from './scenes';

const args = process.argv.slice(2);
const focus = args.find(a => a.startsWith('--focus='))?.slice(8).split(',').filter(Boolean);
for (const target of targets(args.filter(a => !a.startsWith('--')))) {
  const out = resolve(root, 'previews', `${target.name}.png`);
  try {
    const png = new Resvg(previewSvg(load(target), focus), { font: { loadSystemFonts: false } }).render().asPng();
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, png);
    console.log(relative(process.cwd(), out));
  } catch (error) {
    console.log(`✗ ${target.name}: ${(error as Error).message}`);
    process.exitCode = 1;
  }
}

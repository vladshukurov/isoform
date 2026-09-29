// Draws scenes to PNG so an agent (or a person without the editor open) can
// look at the result: the site card at rest, halfway into the hover (delays
// and cascades show up here) and fully hovered, side by side.
//   npm run render                    every file in files/ → previews/<name>.png
//   npm run render vault              only files/vault.json
//   npm run render templates/storage  a template → previews/templates/storage.png
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { previewSvg } from '../src/preview';
import { load, root, targets } from './scenes';

for (const target of targets(process.argv.slice(2))) {
  const out = resolve(root, 'previews', `${target.name}.png`);
  try {
    const png = new Resvg(previewSvg(load(target)), { font: { loadSystemFonts: false } }).render().asPng();
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, png);
    console.log(relative(process.cwd(), out));
  } catch (error) {
    console.log(`✗ ${target.name}: ${(error as Error).message}`);
    process.exitCode = 1;
  }
}

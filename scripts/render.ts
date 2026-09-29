// Draws scenes to PNG so an agent (or a person without the editor open) can
// look at the result: the site card at rest and on hover, side by side.
//   npm run render                    every file in files/ → previews/<name>.png
//   npm run render vault              only files/vault.json
//   npm run render templates/storage  a template → previews/templates/storage.png
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { fit } from '../src/geometry';
import { hoverBox, type Piece, type Scene } from '../src/model';
import { siteSvg } from '../src/render';
import { load, root, targets } from './scenes';

// The site's light theme (passwork ds-tokens.css), as in src/download.ts.
const REST = { page: '#fafafb', top: '#fafafb', left: '#fafafb', right: '#eceef1', edge: '#b9bec6', line: '#8e959f' };
const HOVER = { page: '#fafafb', top: '#f6f9ff', left: '#edf3fe', right: '#e3ecfc', edge: '#a9c1ef', line: '#5a87e0' };
const CARD = 530, GAP = 16, PX = 2;

// The drawing inside siteSvg's artboard, without its colours.
const drawing = (scene: Scene) => siteSvg(scene).match(/<g data-iso[\s\S]*<\/g>/)![0]
  .replace(/ (fill|stroke)="#[0-9a-f]{6}"/g, '').replace(/ vector-effect="non-scaling-stroke"/g, '');

// resvg ignores non-scaling-stroke, so strokes are divided by the fit scale:
// on screen they come out .75 and 1.1 units wide, as on the site.
const style = (cls: string, t: typeof REST, scale: number) =>
  `.${cls} path{stroke:${t.edge};stroke-width:${(.75 / scale).toFixed(4)};stroke-linejoin:round}`
  + `.${cls} path[data-edge]{fill:none;stroke:${t.line};stroke-width:${(1.1 / scale).toFixed(4)}}`
  + `.${cls} path[data-face=top]{fill:${t.top}}.${cls} path[data-face=left]{fill:${t.left}}.${cls} path[data-face=right]{fill:${t.right}}`
  + `.${cls} path[data-hit]{fill:none;stroke:none}`;

const card = (cls: string, x: number, t: typeof REST, body: string) =>
  `<svg class="${cls}" x="${x}" y="0" width="${CARD}" height="${CARD}" viewBox="35 35 ${CARD} ${CARD}">`
  + `<rect x="35" y="35" width="${CARD}" height="${CARD}" fill="${t.page}"/>${body}</svg>`;

function preview(source: Scene) {
  const scene = { ...source, objects: source.objects.filter(p => !p.hidden) };
  // Every block in its hover state, drawn in the rest framing as the site does.
  const hovered = { ...scene, objects: scene.objects.map((p): Piece => ({ id: p.id, ...hoverBox(p) })) };
  const rest = drawing(scene);
  const transform = rest.match(/transform="[^"]*"/)![0];
  const open = drawing(hovered).replace(/transform="[^"]*"/, transform);
  const { scale } = fit(scene.objects);
  const width = CARD * 2 + GAP;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width * PX}" height="${CARD * PX}" viewBox="0 0 ${width} ${CARD}">`
    + `<style>${style('rest', REST, scale)}${style('hover', HOVER, scale)}</style>`
    + `<rect width="${width}" height="${CARD}" fill="#ffffff"/>`
    + card('rest', 0, REST, rest) + card('hover', CARD + GAP, HOVER, open) + '</svg>';
  return new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng();
}

for (const target of targets(process.argv.slice(2))) {
  const out = resolve(root, 'previews', `${target.name}.png`);
  try {
    const png = preview(load(target));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, png);
    console.log(relative(process.cwd(), out));
  } catch (error) {
    console.log(`✗ ${target.name}: ${(error as Error).message}`);
    process.exitCode = 1;
  }
}

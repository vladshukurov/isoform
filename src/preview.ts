// The three-frame still of a scene — rest, halfway into the hover (delays
// and cascades show up here), full hover — in the site card's framing and
// light colours. Used by npm run render (resvg) and by in-editor
// generation, which shows it to the model after every draft.
import { ENTER, hoverAt } from './anim';
import { fit } from './geometry';
import { hoverBox, type Piece, type Scene } from './model';
import { siteSvg } from './render';

// The site's light theme (passwork ds-tokens.css), as in download.ts.
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

// With `focus`, the other blocks fade, so one detail can be judged in place.
export function previewSvg(source: Scene, focus?: string[]) {
  const scene = { ...source, objects: source.objects.filter(p => !p.hidden) };
  // Hover frames, drawn in the rest framing as the site does.
  const at = (boxes: { x: number; y: number; z: number; w: number; d: number; h: number }[]) =>
    ({ ...scene, objects: scene.objects.map((p, i): Piece => ({ id: p.id, ...boxes[i] })) });
  const total = Math.max(0, ...scene.objects.map(p => p.delay ?? 0)) + ENTER;
  const rest = drawing(scene);
  const transform = rest.match(/transform="[^"]*"/)![0];
  const frame = (s: Scene) => drawing(s).replace(/transform="[^"]*"/, transform);
  const middle = frame(at(hoverAt(scene.objects, scene.motion, total / 2)));
  const open = frame(at(scene.objects.map(hoverBox)));
  const { scale } = fit(scene.objects);
  const width = CARD * 3 + GAP * 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width * PX}" height="${CARD * PX}" viewBox="0 0 ${width} ${CARD}">`
    + `<style>${style('rest', REST, scale)}${style('hover', HOVER, scale)}${focus?.length ? `[data-object]{opacity:.28}${focus.map(id => `[data-object="${id}"]`).join(',')}{opacity:1}` : ''}</style>`
    + `<rect width="${width}" height="${CARD}" fill="#ffffff"/>`
    + card('rest', 0, REST, rest) + card('hover', CARD + GAP, HOVER, middle) + card('hover', 2 * (CARD + GAP), HOVER, open) + '</svg>';
  return svg;
}


// The same still as a PNG in the browser, base64 without the data: prefix.
export async function previewPng(scene: Scene) {
  const svg = previewSvg(scene);
  const [, w, h] = svg.match(/width="(\d+)" height="(\d+)"/)!;
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  // Half size is plenty for the model to judge the drawing.
  const canvas = Object.assign(document.createElement('canvas'), { width: +w / 2, height: +h / 2 });
  canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png').split(',')[1];
}

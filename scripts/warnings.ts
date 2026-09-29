// What looks off but may be intended: printed by npm run check with "!",
// never fails it. The eight templates pass clean, keep it that way.
import { GAP, GROUND, hoverBox, type Box, type Scene } from '../src/model';

const LIMIT = 250, MAX_DELAY = .6, MAX_BLOCKS = 24;
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Positive-length overlap of two spans, or exact contact when `touch`.
const spans = (a0: number, a1: number, b0: number, b1: number, touch = false) =>
  touch ? Math.abs(a1 - b0) < .01 || Math.abs(b1 - a0) < .01 : Math.min(a1, b1) - Math.max(a0, b0) > .01;
const alongX = (a: Box, b: Box, touch = false) => spans(a.x, a.x + a.w, b.x, b.x + b.w, touch);
const alongY = (a: Box, b: Box, touch = false) => spans(a.y, a.y + a.d, b.y, b.y + b.d, touch);
const alongZ = (a: Box, b: Box) => spans(a.z, a.z + a.h, b.z, b.z + b.h);

// A block stays up if it stands on a top (or floats one GAP above it) inside
// its footprint, or is fixed side-on to a neighbour (a drawer on a body, a bridge).
function supported(p: Box, others: Box[]) {
  if (p.z <= GROUND) return true;
  return others.some(o =>
    (alongX(p, o) && alongY(p, o) && [p.z, p.z - GAP].some(top => Math.abs(o.z + o.h - top) < .01))
    || (alongZ(p, o) && ((alongX(p, o, true) && alongY(p, o)) || (alongY(p, o, true) && alongX(p, o)))));
}

export function warnings(scene: Scene) {
  const blocks = scene.objects.filter(p => !p.hidden);
  const out: string[] = [];
  for (const p of blocks) {
    if (!supported(p, blocks.filter(o => o !== p))) out.push(`${p.id} висит в воздухе: под ним ничего нет ни вплотную, ни через зазор ${GAP}`);
    if (!KEBAB.test(p.id)) out.push(`${p.id}: id не в kebab-case`);
    if ((p.delay ?? 0) > MAX_DELAY) out.push(`${p.id}: задержка ${p.delay} с — больше ${MAX_DELAY}`);
  }
  const all = blocks.flatMap(p => [p, hoverBox(p)]);
  const reach = (lo: (b: Box) => number, hi: (b: Box) => number) => Math.max(...all.map(b => Math.max(-lo(b), hi(b))));
  const x = reach(b => b.x, b => b.x + b.w), y = reach(b => b.y, b => b.y + b.d);
  if (x > LIMIT) out.push(`сцена широкая: по X до ±${Math.round(x)}, серия укладывается в ±200`);
  if (y > LIMIT) out.push(`сцена глубокая: по Y до ±${Math.round(y)}, серия укладывается в ±200`);
  if (blocks.length > MAX_BLOCKS) out.push(`блоков ${blocks.length} — больше ${MAX_BLOCKS}, образ теряет простоту`);
  return out;
}

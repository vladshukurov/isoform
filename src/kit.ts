// Builders for writing scenes in code (recipes/*.ts) in the series grammar:
// plates, lids one GAP above, rings of four walls, hover as a lift, a slide
// or a grow. Everything returns plain Pieces, so recipes can still spread
// and tweak them by hand.
import { GAP, GROUND, PLATE, depthSort, validateScene, type Box, type Motion, type Piece, type Scene } from './model';

export { GAP, GROUND, PLATE };
// The height a block's top sits at: stack the next one at top(b) or top(b) + GAP.
export const top = (b: Box) => b.z + b.h;

export const block = (id: string, x: number, y: number, z: number, w: number, d: number, h: number): Piece =>
  ({ id, x, y, z, w, d, h });

export const plate = (id: string, x: number, y: number, z: number, w: number, d: number, thickness = PLATE) =>
  block(id, x, y, z, w, d, thickness);

// A block centred on `base`, floating one gap above its top; w and d default to the base's.
export function onTop(base: Box, id: string, size: { w?: number; d?: number; h: number }, gap = GAP): Piece {
  const w = size.w ?? base.w, d = size.d ?? base.d;
  return block(id, base.x + (base.w - w) / 2, base.y + (base.d - d) / 2, base.z + base.h + gap, w, d, size.h);
}

// A square ring of four walls around the origin, standing on the ground.
// Back walls come first and front walls last, so whatever the recipe puts
// between them draws inside the ring (templates/personal.json).
export function ring(id: string, r: number, height: number, wall = 14, z = GROUND): Piece[] {
  return [
    block(`${id}-back-x`, -r, -r, z, 2 * r, wall, height),
    block(`${id}-back-y`, -r, -r + wall, z, wall, 2 * r - wall, height),
    block(`${id}-front-y`, r - wall, -r + wall, z, wall, 2 * r - 2 * wall, height),
    block(`${id}-front-x`, -r + wall, r - wall, z, 2 * r - wall, wall, height),
  ];
}

// `count` copies, `step` units apart: make(offset, id, i) builds copy i as `${id}-${i}`.
export const row = (id: string, count: number, step: number, make: (offset: number, id: string, i: number) => Piece | Piece[]) =>
  Array.from({ length: count }, (_, i) => make(i * step, `${id}-${i}`, i)).flat();

// A square box with a 10-thick lid one GAP above (templates/cicd.json).
export function lidded(id: string, x: number, y: number, size: number, height: number): [Piece, Piece] {
  const base = block(`${id}-base`, x, y, GROUND, size, size, height);
  return [base, onTop(base, `${id}-lid`, { h: 10 })];
}

// Hover helpers: each returns a copy with the hover state added (in units, relative to rest).
const withHover = (piece: Piece, hover: Partial<Box>, delay?: number): Piece =>
  ({ ...piece, hover: { ...piece.hover, ...hover }, ...(delay ? { delay } : {}) });
const at = (piece: Piece) => ({ ...piece, ...piece.hover });

export const lift = (piece: Piece, dz: number, delay?: number) => withHover(piece, { z: at(piece).z + dz }, delay);
export const slide = (piece: Piece, dx: number, dy: number, delay?: number) =>
  withHover(piece, { x: at(piece).x + dx, y: at(piece).y + dy }, delay);
// Sizes grow by the given amounts: the outline morphs, like a drawer pulled out.
export const grow = (piece: Piece, by: { w?: number; d?: number; h?: number }, delay?: number) =>
  withHover(piece, Object.fromEntries(Object.entries(by).map(([k, v]) => [k, at(piece)[k as 'w'] + v!])), delay);

// Shrinks from one side on hover, so a part slides INTO a body instead of
// cutting through it: retract(key, '-x', 40) pulls a key 40 into the lock.
// Move whatever hangs off that side with slide() by the same amount.
export function retract(piece: Piece, side: '-x' | '+x' | '-y' | '+y' | '-z' | '+z', by: number, delay?: number) {
  const axis = side[1] as 'x' | 'y' | 'z', size = ({ x: 'w', y: 'd', z: 'h' } as const)[axis], now = at(piece);
  const hover: Partial<Box> = { [size]: now[size] - by };
  if (side[0] === '-') hover[axis] = now[axis] + by;
  return withHover(piece, hover, delay);
}

// Delays 0, step, 2·step… in array order: a wave.
export const cascade = (pieces: Piece[], step = .04) =>
  pieces.map((p, i): Piece => { const { delay: _, ...rest } = p; return i ? { ...rest, delay: Math.round(i * step * 1000) / 1000 } : rest; });

// The finished scene. Painter order is the array order (nested arrays are
// flattened); `sort: true` depth-sorts instead, for scenes with nothing interlocking.
export function scene(spec: { title: string; motion: Motion; objects: (Piece | Piece[])[]; sort?: boolean }): Scene {
  const objects = spec.objects.flat();
  return validateScene({ version: 2, title: spec.title, motion: spec.motion, objects: spec.sort ? depthSort(objects) : objects });
}

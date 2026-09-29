// Arranging blocks: align, distribute, mirror, rotate, stagger. Pure
// functions over pieces; the editor applies the results.
import { cleanHover, hoverBox, pick, type Box, type Piece } from './model';
import { bounds } from './snap';

export type Axis = 'x' | 'y' | 'z';
export type Edge = 'min' | 'center' | 'max';
const SIZE = { x: 'w', y: 'd', z: 'h' } as const;

// New positions along one axis, for the boxes as they are shown (rest or hover).
export function align(boxes: Map<string, Box>, axis: Axis, edge: Edge) {
  const all = bounds([...boxes.values()]), s = SIZE[axis];
  const target = { min: all[axis], center: all[axis] + all[s] / 2, max: all[axis] + all[s] }[edge];
  return new Map([...boxes].map(([id, b]) =>
    [id, edge === 'min' ? target : edge === 'center' ? target - b[s] / 2 : target - b[s]]));
}

// Equal gaps between neighbours, keeping the outermost two in place.
export function distribute(boxes: Map<string, Box>, axis: Axis) {
  const s = SIZE[axis];
  const sorted = [...boxes].sort(([, a], [, b]) => a[axis] - b[axis]);
  if (sorted.length < 3) return new Map<string, number>();
  const first = sorted[0][1], last = sorted.at(-1)![1];
  const used = sorted.reduce((sum, [, b]) => sum + b[s], 0);
  const gap = (last[axis] + last[s] - first[axis] - used) / (sorted.length - 1);
  let at = first[axis];
  return new Map(sorted.map(([id, b]) => { const v = at; at += b[s] + gap; return [id, v]; }));
}

// Transforms a piece's rest and hover boxes together, so its animation
// is mirrored or turned with it.
function transform(pieces: Piece[], fn: (b: Box) => Box) {
  return pieces.map(p => {
    const rest = fn(pick(p)), hover = fn(hoverBox(p));
    return cleanHover({ ...p, ...rest, hover: p.hover ? hover : undefined });
  });
}

// Mirror across the selection's centre plane (the rest bounds).
export function mirror(pieces: Piece[], axis: 'x' | 'y') {
  const all = bounds(pieces.map(pick)), s = SIZE[axis], c2 = 2 * all[axis] + all[s];
  return transform(pieces, b => ({ ...b, [axis]: c2 - b[axis] - b[s] }));
}

// A quarter turn around the vertical axis through the selection's centre.
export function rotate(pieces: Piece[]) {
  const all = bounds(pieces.map(pick)), cx = all.x + all.w / 2, cy = all.y + all.d / 2;
  return transform(pieces, b => ({ ...b, x: cx - (b.y + b.d - cy), y: cy + (b.x - cx), w: b.d, d: b.w }));
}

// Delays stepping back to front in painter order: a wave through the scene.
// Which block goes first in a wave: back to front in the painter order (the
// series' default), the reverse, bottom up, top down, or all at once.
export type WaveOrder = 'back' | 'front' | 'up' | 'down' | 'together';
export function stagger(pieces: Piece[], step = .04, order: WaveOrder = 'back') {
  if (order === 'together') return new Map(pieces.map(p => [p.id, 0]));
  if (order === 'back' || order === 'front') {
    const list = order === 'back' ? pieces : [...pieces].reverse();
    return new Map(list.map((p, i) => [p.id, +(i * step).toFixed(3)]));
  }
  // Up and down go by level: blocks at the same height move together.
  const level = (p: Piece) => order === 'up' ? p.z : -(p.z + p.h);
  const levels = [...new Set(pieces.map(level))].sort((a, b) => a - b);
  return new Map(pieces.map(p => [p.id, +(levels.indexOf(level(p)) * step).toFixed(3)]));
}

// count − 1 copies of the group, one after another along an axis with a
// gap between them (the group's own size + gap per step).
export function repeatOffsets(pieces: Piece[], axis: Axis, count: number, gap: number) {
  const size = bounds(pieces.map(pick))[SIZE[axis]], step = size + gap;
  return Array.from({ length: Math.max(0, count - 1) }, (_, i) =>
    ({ x: 0, y: 0, z: 0, [axis]: step * (i + 1) }) as { x: number; y: number; z: number });
}

// Lowers the group until it rests on the highest top below its footprint,
// or on the ground: gravity for stacking by hand.
export function dropHeight(group: Box, others: Box[], ground: number) {
  const below = others.filter(o =>
    Math.min(group.x + group.w, o.x + o.w) - Math.max(group.x, o.x) > .01
    && Math.min(group.y + group.d, o.y + o.d) - Math.max(group.y, o.y) > .01
    && o.z + o.h <= group.z + .01);
  return Math.max(ground, ...below.map(o => o.z + o.h));
}

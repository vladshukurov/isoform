// Smart guides for the iso canvas: a moving block (or group) snaps its
// edges and centre to other blocks along X and Y, and its bottom/top to
// other blocks' tops, bottoms, the series GAP and the ground along Z.
import type { Vec3 } from './geometry';
import { GAP, GROUND, type Box } from './model';

export type Guide = { from: Vec3; to: Vec3 };
type Axis = 'x' | 'y' | 'z';
const SIZE = { x: 'w', y: 'd', z: 'h' } as const;

export function bounds(boxes: Box[]): Box {
  const minX = Math.min(...boxes.map(b => b.x)), minY = Math.min(...boxes.map(b => b.y)), minZ = Math.min(...boxes.map(b => b.z));
  return {
    x: minX, y: minY, z: minZ,
    w: Math.max(...boxes.map(b => b.x + b.w)) - minX,
    d: Math.max(...boxes.map(b => b.y + b.d)) - minY,
    h: Math.max(...boxes.map(b => b.z + b.h)) - minZ,
  };
}

// Lines a block offers to others along an axis.
function stops(b: Box, axis: Axis) {
  const lo = b[axis], hi = b[axis] + b[SIZE[axis]];
  return axis === 'z' ? [lo, hi, hi + GAP, lo - GAP] : [lo, hi, (lo + hi) / 2];
}

// The smallest correction that lands one of `mine` on one of the targets.
function nearest(mine: number[], targets: { value: number; box?: Box }[], threshold: number) {
  let best: { delta: number; value: number; box?: Box } | null = null;
  for (const m of mine) for (const t of targets) {
    const delta = t.value - m;
    if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, value: t.value, box: t.box };
  }
  return best;
}

// A guide runs along the other floor axis through both boxes, at the moving box's floor.
function guideFor(axis: Axis, value: number, moving: Box, target?: Box): Guide {
  if (axis === 'z') {
    const span = target ? bounds([moving, target]) : moving;
    return { from: { x: span.x, y: span.y + span.d, z: value }, to: { x: span.x + span.w, y: span.y + span.d, z: value } };
  }
  const other = axis === 'x' ? 'y' : 'x';
  const span = target ? bounds([moving, target]) : moving;
  const lo = span[other] - 10, hi = span[other] + span[SIZE[other]] + 10, z = Math.min(moving.z, target?.z ?? moving.z);
  const at = (v: number): Vec3 => axis === 'x' ? { x: value, y: v, z } : { x: v, y: value, z };
  return { from: at(lo), to: at(hi) };
}

// Moving a group: returns the corrected offset and the guides to draw.
export function snapMove(moving: Box, offset: Vec3, others: Box[], threshold: number, axes: Axis[]) {
  const moved = { ...moving, x: moving.x + offset.x, y: moving.y + offset.y, z: moving.z + offset.z };
  const out = { ...offset }, guides: Guide[] = [];
  for (const axis of axes) {
    const targets: { value: number; box?: Box }[] = others.flatMap(box => stops(box, axis).map(value => ({ value, box })));
    if (axis === 'z') targets.push({ value: GROUND });
    const size = moved[SIZE[axis]], lo = moved[axis];
    const mine = axis === 'z' ? [lo, lo + size] : [lo, lo + size, lo + size / 2];
    const hit = nearest(mine, targets, threshold);
    if (!hit) continue;
    out[axis] += hit.delta;
    moved[axis] += hit.delta;
    guides.push(guideFor(axis, hit.value, moved, hit.box));
  }
  return { offset: out, guides };
}

// Resizing: the moving face (x+w, y+d or z+h) snaps to other blocks' stops.
export function snapSize(box: Box, key: 'w' | 'd' | 'h', others: Box[], threshold: number) {
  const axis = ({ w: 'x', d: 'y', h: 'z' } as const)[key];
  const face = box[axis] + box[key];
  const hit = nearest([face], others.flatMap(b => stops(b, axis).map(value => ({ value, box: b }))), threshold);
  if (!hit || face + hit.delta - box[axis] <= 0) return { size: box[key], guides: [] as Guide[] };
  const resized = { ...box, [key]: box[key] + hit.delta };
  return { size: resized[key], guides: [guideFor(axis, hit.value, resized, hit.box)] };
}

// Drawing: a floor point snaps to other blocks' X and Y lines.
export function snapPoint(p: { x: number; y: number }, z: number, others: Box[], threshold: number) {
  const out = { ...p }, guides: Guide[] = [];
  for (const axis of ['x', 'y'] as const) {
    const hit = nearest([p[axis]], others.flatMap(b => stops(b, axis).map(value => ({ value, box: b }))), threshold);
    if (!hit) continue;
    out[axis] = hit.value;
    guides.push(guideFor(axis, hit.value, { x: out.x, y: out.y, z, w: 0, d: 0, h: 0 }, hit.box));
  }
  return { point: out, guides };
}

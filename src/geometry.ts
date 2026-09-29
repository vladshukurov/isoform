// Fixed 30° isometry, the same formulas as Isoform Studio and the site's
// motion code, so exports stay byte-compatible with the art already shipped.
import type { Box } from './model';

export type Vec3 = { x: number; y: number; z: number };
export type Vec2 = { x: number; y: number };
export type FaceKind = 'left' | 'right' | 'top';

const angle = Math.PI / 6;
export const COS = Math.cos(angle), SIN = Math.sin(angle);

export function project(p: Vec3): Vec2 {
  return { x: (p.x - p.y) * Math.cos(angle), y: (p.x + p.y) * Math.sin(angle) - p.z };
}

// Screen delta → movement on the floor plane.
export function unprojectFloor(dx: number, dy: number) {
  return { x: dx / (2 * COS) + dy / (2 * SIN), y: dy / (2 * SIN) - dx / (2 * COS) };
}

// Screen direction of one scene unit along each axis.
export const AXIS: Record<'x' | 'y' | 'z', Vec2> = {
  x: { x: COS, y: SIN }, y: { x: -COS, y: SIN }, z: { x: 0, y: -1 },
};

export function vertices(b: Box): Vec3[] {
  const { x, y, z } = b, w = Math.max(1, b.w), d = Math.max(1, b.d), h = Math.max(1, b.h);
  return [
    { x, y, z }, { x: x + w, y, z }, { x: x + w, y: y + d, z }, { x, y: y + d, z },
    { x, y, z: z + h }, { x: x + w, y, z: z + h }, { x: x + w, y: y + d, z: z + h }, { x, y: y + d, z: z + h },
  ];
}

// Only the three faces a viewer can see; faces are opaque so the painter
// order hides whatever is behind them.
export function faces(b: Box): { kind: FaceKind; points: Vec2[] }[] {
  const v = vertices(b);
  return [
    { kind: 'left', points: [v[3], v[2], v[6], v[7]].map(project) },
    { kind: 'right', points: [v[1], v[2], v[6], v[5]].map(project) },
    { kind: 'top', points: [v[4], v[5], v[6], v[7]].map(project) },
  ];
}

export const path = (points: Vec2[]) =>
  `M ${points.map(p => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' L ')} Z`;

export function hull(points: Vec2[]) {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list: Vec2[]) => list.reduce((h: Vec2[], q) => {
    while (h.length > 1 && cross(h.at(-2)!, h.at(-1)!, q) <= 0) h.pop();
    h.push(q); return h;
  }, []);
  return [...half(p).slice(0, -1), ...half(p.reverse()).slice(0, -1)];
}

export const outline = (b: Box) => path(hull(vertices(b).map(project)));

// Every scene is scaled to the same silhouette area (convex hull of the
// projected geometry) so light scenes don't look small next to dense ones,
// then capped to the card frame and centred.
export const ARTBOARD = 600, TARGET_AREA = 72000, MAX_W = 440, MAX_H = 380;
export function fit(boxes: Box[]) {
  const points = boxes.flatMap(b => vertices(b).map(project));
  if (!points.length) return { scale: 1, cx: 0, cy: 0, area: 0 };
  const h = hull(points);
  const area = Math.abs(h.reduce((sum, p, i) => sum + p.x * h[(i + 1) % h.length].y - h[(i + 1) % h.length].x * p.y, 0)) / 2;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = Math.min(Math.sqrt(TARGET_AREA / Math.max(area, 1)), MAX_W / Math.max(maxX - minX, 1), MAX_H / Math.max(maxY - minY, 1));
  return { scale, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, area };
}

// The whole illustration grammar of the Passwork series: rectangular blocks
// on a fixed 30° isometry, drawn as lines with page-coloured faces. A scene is
// an ordered list of blocks (the order is the painter order) plus, per block,
// an optional hover state the page animates to.

export type Box = { x: number; y: number; z: number; w: number; d: number; h: number };
export type BoxKey = keyof Box;
export const BOX_KEYS: BoxKey[] = ['x', 'y', 'z', 'w', 'd', 'h'];

export type Piece = Box & {
  id: string;
  // Values that differ on hover. Position only → the block travels;
  // size too → its outline morphs (a drawer growing out of a cabinet).
  hover?: Partial<Box>;
  // Seconds before this block starts moving on hover.
  delay?: number;
  // Editor only: hidden blocks are left out of the export, locked ones
  // can't be picked on the canvas.
  hidden?: boolean;
  locked?: boolean;
};

// Mechanical scenes move like real parts (in-out); layered ones open like an
// exploded diagram (ease-out) and also assemble on first appearance.
export type Motion = 'mechanical' | 'layered';

export type Scene = { version: 2; title: string; motion: Motion; objects: Piece[] };

// Series constants: blocks stand on an implied ground at z = GROUND, layers
// float with one shared GAP, and positions snap to SNAP units.
export const GROUND = 14;
export const GAP = 10;
export const SNAP = 2;
export const PLATE = 8;

export const hoverBox = (piece: Piece): Box => ({ ...pick(piece), ...piece.hover });
export const pick = ({ x, y, z, w, d, h }: Box): Box => ({ x, y, z, w, d, h });

export function hoverKind(piece: Piece): 'rest' | 'move' | 'morph' {
  const target = hoverBox(piece);
  if (BOX_KEYS.every(k => target[k] === piece[k])) return 'rest';
  return target.w === piece.w && target.d === piece.d && target.h === piece.h ? 'move' : 'morph';
}

// Drop hover values that equal the rest state, so the file only keeps real changes.
export function cleanHover(piece: Piece): Piece {
  const entries = Object.entries(piece.hover ?? {}).filter(([k, v]) => piece[k as BoxKey] !== v);
  const { hover: _, ...rest } = piece;
  return entries.length ? { ...rest, hover: Object.fromEntries(entries) } : rest;
}

export function validateScene(input: unknown): Scene {
  const fail = (why: string): never => { throw new Error(`Некорректная сцена: ${why}`); };
  const s = input as Scene;
  if (!s || s.version !== 2) fail('нужна version: 2');
  if (typeof s.title !== 'string') fail('нет title');
  if (s.motion !== 'mechanical' && s.motion !== 'layered') fail('motion — mechanical или layered');
  if (!Array.isArray(s.objects)) fail('нет objects');
  const ids = new Set<string>();
  for (const p of s.objects) {
    if (!p || typeof p !== 'object') fail('блок должен быть объектом');
    if (typeof p.id !== 'string' || !p.id) fail('у блока нет id');
    if (ids.has(p.id)) fail(`повторяется id ${p.id}`);
    ids.add(p.id);
    for (const k of BOX_KEYS) if (!Number.isFinite(p[k])) fail(`${p.id}.${k} не число`);
    if (p.hover !== undefined) {
      if (!p.hover || typeof p.hover !== 'object') fail(`${p.id}.hover должен быть объектом`);
      for (const [k, v] of Object.entries(p.hover)) {
        if (!BOX_KEYS.includes(k as BoxKey)) fail(`${p.id}.hover.${k}: такого ключа нет`);
        if (!Number.isFinite(v)) fail(`${p.id}.hover.${k} не число`);
      }
    }
    for (const k of ['w', 'd', 'h'] as const) if (p[k] <= 0 || (p.hover?.[k] ?? 1) <= 0) fail(`${p.id}.${k} ≤ 0`);
    if (p.delay !== undefined && !(Number.isFinite(p.delay) && p.delay >= 0)) fail(`${p.id}.delay — секунды ≥ 0`);
    for (const k of ['hidden', 'locked'] as const) if (p[k] !== undefined && typeof p[k] !== 'boolean') fail(`${p.id}.${k} — true или false`);
  }
  return s;
}

export function uniqueId(scene: Scene, base: string) {
  const taken = new Set(scene.objects.map(p => p.id));
  const stem = base.replace(/-\d+$/, '');
  if (!taken.has(base)) return base;
  for (let i = 1; ; i++) if (!taken.has(`${stem}-${i}`)) return `${stem}-${i}`;
}

// Default painter order: back to front by the block's near-bottom corner.
// Interlocking structures (rings, drawers in a body) still need a manual order.
export const depthSort = (objects: Piece[]) =>
  [...objects].sort((a, b) => (a.x + a.y + a.z) - (b.x + b.y + b.z));

// Where a new block goes in the painter order: after everything nearer the back.
export function insertByDepth(objects: Piece[], piece: Piece) {
  const key = (p: Box) => p.x + p.y + p.z;
  const at = objects.findIndex(p => key(p) > key(piece));
  return at < 0 ? [...objects, piece] : [...objects.slice(0, at), piece, ...objects.slice(at)];
}

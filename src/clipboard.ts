// Copy and paste of blocks, within a file, across files and through the
// system clipboard: pasted text may be our own payload, a whole scene JSON
// (for example one an agent printed) or a bare list of blocks.
import { cleanHover, GAP, uniqueId, validateScene, type Piece, type Scene } from './model';

const KIND = 'isoform/blocks';
export const serialize = (pieces: Piece[]) => JSON.stringify({ kind: KIND, pieces });

export function parse(text: string): Piece[] | undefined {
  try {
    const data = JSON.parse(text);
    const pieces = data?.kind === KIND ? data.pieces : Array.isArray(data) ? data : data?.version === 2 ? data.objects : undefined;
    if (!Array.isArray(pieces) || !pieces.length) return undefined;
    // Reuse the scene validator for shape and ids.
    return validateScene({ version: 2, title: '', motion: 'mechanical', objects: pieces }).objects;
  } catch {
    return undefined;
  }
}

// Pasted blocks keep their place, like Figma, unless that spot is exactly
// where the originals still are; then they step one GAP to the right.
// An explicit offset (a repeated ⌘D) moves the copies by that much instead.
export function paste(scene: Scene, pieces: Piece[], offset?: { x: number; y: number; z: number }) {
  const occupied = pieces.every(p => scene.objects.some(o => o.x === p.x && o.y === p.y && o.z === p.z && o.w === p.w && o.d === p.d && o.h === p.h));
  const minX = Math.min(...pieces.map(p => p.x)), maxX = Math.max(...pieces.map(p => p.x + p.w));
  const by = offset ?? { x: occupied ? maxX - minX + GAP : 0, y: 0, z: 0 };
  let next = scene;
  const ids: string[] = [];
  for (const p of pieces) {
    const id = uniqueId(next, p.id);
    const hover = p.hover && Object.fromEntries(Object.entries(p.hover).map(([k, v]) => [k, k in by ? v + by[k as 'x'] : v]));
    next = { ...next, objects: [...next.objects, cleanHover({ ...p, id, x: p.x + by.x, y: p.y + by.y, z: p.z + by.z, hover, locked: undefined, hidden: undefined })] };
    ids.push(id);
  }
  return { scene: next, ids };
}

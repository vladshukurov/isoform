import { describe, expect, it } from 'vitest';
import { paste, parse, serialize } from '../src/clipboard';
import { evaluate } from '../src/expr';
import { GAP, GROUND, type Piece, type Scene } from '../src/model';
import { overlaps } from '../src/review';
import { snapMove, snapSize } from '../src/snap';

const block = (id: string, x: number, y = 0, z = GROUND, w = 40, d = 40, h = 40): Piece => ({ id, x, y, z, w, d, h });
const scene = (...objects: Piece[]): Scene => ({ version: 2, title: 't', motion: 'mechanical', objects });

describe('number field expressions', () => {
  it.each([['120/2', 60], ['(40+8)*3', 144], ['1,5', 1.5], ['-12', -12], [' 2 * -3 ', -6], ['7', 7]])('%s = %d', (input, value) =>
    expect(evaluate(input)).toBe(value));
  it.each(['', 'abc', '2+', '(1', '1/0', 'alert(1)'])('rejects %j', input => expect(evaluate(input)).toBeUndefined());
});

describe('smart guides', () => {
  const others = [block('a', 0)];
  it('snaps an edge within the threshold and reports a guide', () => {
    const { offset, guides } = snapMove(block('m', 100), { x: -57, y: 0, z: 0 }, others, 4, ['x', 'y']);
    expect(offset.x).toBe(-60); // m.x lands on a's far edge (40)
    expect(guides).toHaveLength(2); // x edge, and y already aligned
  });
  it('leaves the offset alone outside the threshold', () => {
    expect(snapMove(block('m', 100, 100), { x: -30, y: 0, z: 0 }, others, 4, ['x']).offset.x).toBe(-30);
  });
  it('stacks a GAP above another block', () => {
    const { offset } = snapMove(block('m', 0, 0, GROUND), { x: 0, y: 0, z: 48 }, others, 4, ['z']);
    expect(GROUND + offset.z).toBe(GROUND + 40 + GAP);
  });
  it('snaps a resized face', () => {
    expect(snapSize(block('m', 0, 60, GROUND, 38), 'w', others, 4).size).toBe(40);
  });
});

describe('clipboard', () => {
  it('round-trips blocks and pastes next to the originals', () => {
    const s = scene(block('a', 0));
    const pieces = parse(serialize(s.objects))!;
    const { scene: next, ids } = paste(s, pieces);
    expect(ids).toEqual(['a-1']);
    expect(next.objects[1].x).toBe(40 + GAP);
  });
  it('pastes in place into another file and accepts a whole scene JSON', () => {
    const pieces = parse(JSON.stringify(scene(block('a', 0))))!;
    expect(paste(scene(block('b', 200)), pieces).scene.objects[1]).toMatchObject({ id: 'a', x: 0 });
  });
  it('ignores unrelated text', () => expect(parse('hello')).toBeUndefined());
});

describe('overlap flags', () => {
  it('marks both blocks of a pair, at rest or on hover', () => {
    const s = scene(block('a', 0), block('b', 20), { ...block('c', 100), hover: { x: 10 } });
    const flags = overlaps(s);
    expect([...flags.get('a')!]).toEqual(['b', 'c']);
    expect([...flags.get('c')!]).toEqual(['a', 'b']);
  });
});

describe('editing rest and hover', async () => {
  const { patchPiece } = await import('../src/editor');
  const { hoverKind } = await import('../src/model');
  const drawer: Piece = { ...block('drawer', 0, 0, GROUND, 60), hover: { w: 80 } };
  it('keeps a morph when a rest size passes through the hover value', () => {
    const through = patchPiece(patchPiece(drawer, { w: 80 }, 'rest'), { w: 90 }, 'rest');
    expect(through.hover).toEqual({ w: 80 });
    expect(hoverKind(through)).toBe('morph');
  });
  it('carries the hover offset along when the block moves at rest', () => {
    const lid: Piece = { ...block('lid', 0), hover: { z: GROUND + 20 } };
    expect(patchPiece(lid, { z: GROUND + 10 }, 'rest').hover).toEqual({ z: GROUND + 30 });
  });
});

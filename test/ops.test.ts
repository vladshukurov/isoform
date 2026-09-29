import { describe, expect, it } from 'vitest';
import { GROUND, hoverBox, pick, type Box, type Piece } from '../src/model';
import { align, distribute, mirror, rotate, stagger } from '../src/ops';

const block = (id: string, x: number, y = 0, w = 40, d = 40, h = 40, hover?: Piece['hover']): Piece =>
  ({ id, x, y, z: GROUND, w, d, h, ...(hover ? { hover } : {}) });
const boxes = (...pieces: Piece[]) => new Map<string, Box>(pieces.map(p => [p.id, pick(p)]));

describe('align and distribute', () => {
  const a = block('a', 0), b = block('b', 100, 0, 20), c = block('c', 300, 0, 60);
  it('aligns edges and centres', () => {
    expect([...align(boxes(a, b, c), 'x', 'min').values()]).toEqual([0, 0, 0]);
    expect([...align(boxes(a, b, c), 'x', 'max').values()]).toEqual([320, 340, 300]);
    expect([...align(boxes(a, b, c), 'x', 'center').values()]).toEqual([160, 170, 150]);
  });
  it('spaces blocks evenly between the outer two', () => {
    const at = distribute(boxes(a, b, c), 'x');
    expect(at.get('a')).toBe(0);
    expect(at.get('c')).toBe(300);
    expect(at.get('b')! - 40).toBe(300 - (at.get('b')! + 20));
  });
  it('needs three blocks to distribute', () => expect(distribute(boxes(a, b), 'x').size).toBe(0));
});

describe('mirror and rotate', () => {
  it('mirrors a group across its centre and takes the hover along', () => {
    const [m1, m2] = mirror([block('a', 0), block('b', 60, 0, 40, 40, 40, { x: 80 })], 'x');
    expect(m1.x).toBe(60);
    expect(m2.x).toBe(0);
    expect(hoverBox(m2).x).toBe(-20); // slid right before, slides left now
  });
  it('turns a quarter around the vertical axis, swapping width and depth', () => {
    const [r] = rotate([block('a', 0, 0, 100, 20)]);
    expect(pick(r)).toEqual({ x: 40, y: -40, z: GROUND, w: 20, d: 100, h: 40 });
  });
  it('four turns come back to the start', () => {
    let pieces = [block('a', 0), block('b', 50, 10, 30, 60, 40, { y: 30 })];
    for (let i = 0; i < 4; i++) pieces = rotate(pieces);
    expect(pieces).toEqual([block('a', 0), block('b', 50, 10, 30, 60, 40, { y: 30 })]);
  });
});

describe('stagger', () => {
  it('steps delays in painter order', () =>
    expect([...stagger([block('a', 0), block('b', 0), block('c', 0)], .05).values()]).toEqual([0, .05, .1]));
});

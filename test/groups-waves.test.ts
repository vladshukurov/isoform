import { describe, expect, it } from 'vitest';
import { paste } from '../src/clipboard';
import { validateScene, type Piece, type Scene } from '../src/model';
import { stagger } from '../src/ops';

const block = (id: string, z: number, extra: Partial<Piece> = {}): Piece => ({ id, x: 0, y: 0, z, w: 10, d: 10, h: 10, ...extra });
const scene = (objects: Piece[]): Scene => ({ version: 2, title: 't', motion: 'mechanical', objects });

describe('waves of delays', () => {
  const pieces = [block('low', 14), block('mid', 34), block('mid-2', 34), block('top', 54)];
  it('goes back to front, front to back, or all at once', () => {
    expect([...stagger(pieces, .1, 'back').values()]).toEqual([0, .1, .2, .3]);
    expect(stagger(pieces, .1, 'front').get('top')).toBe(0);
    expect([...stagger(pieces, .1, 'together').values()]).toEqual([0, 0, 0, 0]);
  });
  it('rises by level: blocks at one height move together', () => {
    const up = stagger(pieces, .1, 'up');
    expect([up.get('low'), up.get('mid'), up.get('mid-2'), up.get('top')]).toEqual([0, .1, .1, .2]);
    expect(stagger(pieces, .1, 'down').get('top')).toBe(0);
  });
});

describe('groups', () => {
  it('are a name on each block, checked like the rest', () => {
    expect(() => validateScene(scene([block('a', 14, { group: 'key' })]))).not.toThrow();
    expect(() => validateScene(scene([block('a', 14, { group: '' as string })]))).toThrow(/group/);
  });
  it('copies of a group make a group of their own', () => {
    const s = scene([block('ring', 14, { group: 'key' }), block('blade', 14, { group: 'key' })]);
    const { scene: next, ids } = paste(s, s.objects);
    const copies = next.objects.filter(p => ids.includes(p.id));
    expect(new Set(copies.map(p => p.group)).size).toBe(1);
    expect(copies[0].group).not.toBe('key');
  });
});

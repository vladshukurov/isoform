import { describe, expect, it } from 'vitest';
import { suggest } from '../src/ai/suggest';
import type { Piece, Scene } from '../src/model';

const scene = (objects: Piece[]): Scene => ({ version: 2, title: 't', motion: 'mechanical', objects });
const block = (id: string, extra: Partial<Piece> = {}): Piece => ({ id, x: 0, y: 0, z: 14, w: 40, d: 40, h: 40, ...extra });

describe('suggestions', () => {
  it('differ from file to file for a new scene, and stay put within one', () => {
    const a = suggest({ selection: [], fresh: true, file: 'alpha' }), b = suggest({ selection: [], fresh: true, file: 'beta' });
    expect(a).not.toEqual(b);
    expect(suggest({ selection: [], fresh: true, file: 'alpha' })).toEqual(a);
  });
  it('never repeat what was asked', () => {
    const first = suggest({ selection: [], fresh: true, file: 'x' })[0];
    expect(suggest({ selection: [], fresh: true, file: 'x', asked: [first] })).not.toContain(first);
  });
  it('come from the scene: motion when nothing moves, Claude\'s own next steps first', () => {
    const still = scene([block('a'), block('b', { x: 50 })]);
    expect(suggest({ scene: still, selection: [], file: 'x' })).toContain('Добавь движение при наведении');
    expect(suggest({ scene: still, selection: [], file: 'x', next: ['Крышку выше'] })[0]).toBe('Крышку выше');
  });
  it('fit the selection: a still block is offered a motion, moving ones a wave', () => {
    const s = scene([block('a'), block('b', { hover: { z: 40 } }), block('c', { x: 50, hover: { z: 40 } })]);
    expect(suggest({ scene: s, selection: ['a'], file: 'x' })[0]).toBe('Пусть выезжает вперёд при наведении');
    expect(suggest({ scene: s, selection: ['b', 'c'], file: 'x' })).toContain('Пусть двигаются волной');
  });
});

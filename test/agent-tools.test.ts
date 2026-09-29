import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { block, cascade, grow, lidded, lift, onTop, ring, row, scene, slide } from '../src/kit';
import { GAP, GROUND, pick, validateScene, type Scene } from '../src/model';
import { review } from '../src/review';
import stack from '../recipes/example-stack';
import vault from '../recipes/example-vault';
import { warnings } from '../scripts/warnings';

const template = (name: string) => validateScene(JSON.parse(readFileSync(`templates/${name}.json`, 'utf8')));
const names = ['access', 'cicd', 'config', 'government', 'infrastructure', 'personal', 'production', 'storage'];

describe('kit', () => {
  it('ring matches the outer ring of personal.json', () => {
    const outer = template('personal').objects.filter(p => p.id.startsWith('outer-'));
    expect(ring('outer', 120, 24).map(p => ({ id: p.id, ...pick(p) }))).toEqual(outer.map(p => ({ id: p.id, ...pick(p) })));
  });
  it('ring matches the inner ring too', () => {
    const inner = template('personal').objects.filter(p => p.id.startsWith('inner-'));
    expect(ring('inner', 78, 36).map(pick)).toEqual(inner.map(pick));
  });
  it('onTop centres on the base one GAP above', () => {
    const base = block('b', -40, -20, GROUND, 80, 40, 30);
    expect(pick(onTop(base, 't', { w: 40, d: 20, h: 8 }))).toEqual({ x: -20, y: -10, z: GROUND + 30 + GAP, w: 40, d: 20, h: 8 });
    expect(onTop(base, 't', { h: 8 }, 0)).toMatchObject({ x: -40, y: -20, z: GROUND + 30, w: 80, d: 40 });
  });
  it('lidded matches a cicd box', () => {
    const cicd = template('cicd').objects;
    expect(lidded('source', -130, -130, 80, 90).map(pick)).toEqual(cicd.filter(p => p.id.startsWith('source-')).map(pick));
  });
  it('cascade spaces delays by the step from zero', () => {
    const out = cascade([1, 2, 3, 4].map(i => block(`b-${i}`, i * 50, 0, GROUND, 40, 40, 40)), .06);
    expect(out.map(p => p.delay)).toEqual([undefined, .06, .12, .18]);
  });
  it('hover helpers stack on each other', () => {
    const p = grow(slide(lift(block('p', 0, 0, GROUND, 40, 8, 30), 20, .1), 0, 12), { d: 40 });
    expect(p).toMatchObject({ delay: .1, hover: { z: GROUND + 20, x: 0, y: 12, d: 48 } });
  });
  it('row names and offsets copies', () => {
    expect(row('col', 3, 50, (dx, id) => block(id, dx, 0, GROUND, 20, 20, 60)).map(p => [p.id, p.x])).toEqual([['col-0', 0], ['col-1', 50], ['col-2', 100]]);
  });
  it('scene keeps array order unless asked to sort', () => {
    const [far, near] = [block('far', -100, -100, GROUND, 20, 20, 20), block('near', 100, 100, GROUND, 20, 20, 20)];
    expect(scene({ title: 't', motion: 'mechanical', objects: [near, far] }).objects.map(p => p.id)).toEqual(['near', 'far']);
    expect(scene({ title: 't', motion: 'mechanical', objects: [[near], far], sort: true }).objects.map(p => p.id)).toEqual(['far', 'near']);
  });
});

describe('example recipes', () => {
  for (const [name, made] of [['vault', vault], ['stack', stack]] as [string, Scene][]) {
    it(`${name} validates and passes review clean`, () => {
      expect(validateScene(made)).toBe(made);
      expect(review(made)).toEqual([]);
      expect(warnings(made)).toEqual([]);
      expect(made.objects.some(p => p.hover)).toBe(true);
    });
  }
  it('stack is layered', () => expect(stack.motion).toBe('layered'));
});

describe('check warnings', () => {
  it.each(names)('%s has none', name => expect(warnings(template(name))).toEqual([]));
  it('flags floating, wide, slow and badly named blocks', () => {
    const s = scene({ title: 't', motion: 'mechanical', objects: [
      block('base', -40, -40, GROUND, 80, 80, 20),
      block('Float', -300, 100, 80, 20, 20, 20),
      { ...block('slow', -20, -20, GROUND + 20, 40, 40, 20), delay: .8 },
    ] });
    const out = warnings(s).join('\n');
    expect(out).toMatch(/Float висит/);
    expect(out).toMatch(/Float: id не в kebab-case/);
    expect(out).toMatch(/slow: задержка/);
    expect(out).toMatch(/широкая/);
    expect(out).not.toMatch(/slow висит/);
  });
});

describe('retract and top', async () => {
  const { block, retract, top } = await import('../src/kit');
  const { hoverBox } = await import('../src/model');
  it('shrinks from the chosen side, keeping the opposite face in place', () => {
    const key = block('key', 100, 0, 40, 80, 10, 10);
    expect(hoverBox(retract(key, '-x', 30))).toMatchObject({ x: 130, w: 50 });
    expect(hoverBox(retract(key, '+x', 30))).toMatchObject({ x: 100, w: 50 });
  });
  it('top is z + h', () => expect(top(block('a', 0, 0, 14, 1, 1, 30))).toBe(44));
});

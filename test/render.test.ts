import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatScene } from '../src/format';
import { validateScene } from '../src/model';
import { siteMotion, siteSvg } from '../src/render';

const names = readdirSync('test/fixtures').filter(f => f.endsWith('.svg')).map(f => f.replace('.svg', ''));
const load = (name: string) => validateScene(JSON.parse(readFileSync(`scenes/${name}.json`, 'utf8')));

// Fixtures are the SVGs shipped on the site from Isoform Studio. The new
// editor must reproduce them byte for byte, morph outlines included.
describe('site export', () => {
  it('covers the eight site scenes', () => expect(names).toHaveLength(8));
  for (const name of names) {
    it(`${name}.svg matches the shipped art`, () => {
      expect(siteSvg(load(name))).toBe(readFileSync(`test/fixtures/${name}.svg`, 'utf8'));
    });
  }
});

describe('hover choreography', async () => {
  const shipped = JSON.parse(readFileSync('test/fixtures/motion.json', 'utf8'));
  for (const name of names) {
    it(`${name} matches the site's motion`, () => {
      const { pieces, morphDelay } = siteMotion(load(name));
      const sorted = (list: any[]) => [...list].sort((a, b) => a[0].localeCompare(b[0]));
      expect(sorted(pieces)).toEqual(sorted(shipped[name].pieces));
      // A missing morph delay means 0 on the site.
      const nonzero = (m: Record<string, number> = {}) => Object.fromEntries(Object.entries(m).filter(([, d]) => d));
      expect(nonzero(morphDelay)).toEqual(nonzero(shipped[name].morphDelay));
    });
  }
});

describe('scene files', () => {
  for (const name of names) {
    it(`${name}.json is stored in canonical form`, () => {
      const text = readFileSync(`scenes/${name}.json`, 'utf8');
      expect(formatScene(JSON.parse(text))).toBe(text);
    });
  }
});

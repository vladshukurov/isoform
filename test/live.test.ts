import { describe, expect, it } from 'vitest';
import { partialScene } from '../server/agent';
import { formatScene } from '../src/format';

// Claude's Write arrives as streamed JSON; every complete block line shows up at once.
describe('live drafts from a streaming Write', () => {
  const scene = { version: 2 as const, title: 'Сейф "А"', motion: 'mechanical' as const, objects: [
    { id: 'base', x: 0, y: 0, z: 14, w: 100, d: 100, h: 8 },
    { id: 'body', x: 10, y: 10, z: 32, w: 80, d: 80, h: 60, hover: { z: 40 } },
  ] };
  const input = JSON.stringify({ file_path: '/p/files/safe.json', content: formatScene(scene) });

  it('finds the blocks written so far', () => {
    const cut = input.indexOf('body') + 20; // in the middle of the second block
    expect(partialScene(input.slice(0, cut), 'files/safe.json')!.objects.map(o => (o as { id: string }).id)).toEqual(['base']);
    const whole = partialScene(input, 'files/safe.json')!;
    expect(whole.objects).toHaveLength(2);
    expect(whole.title).toBe('Сейф "А"');
    expect(whole.motion).toBe('mechanical');
  });

  it('ignores writes to other files and an unfinished escape', () => {
    expect(partialScene(input, 'files/other.json')).toBeNull();
    expect(partialScene(input.slice(0, input.indexOf('\\n') + 1), 'files/safe.json')!.objects).toEqual([]);
  });
});

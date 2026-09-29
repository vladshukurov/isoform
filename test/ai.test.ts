import { describe, expect, it, vi } from 'vitest';
import type { Scene } from '../src/model';

// The API loop without the network: a fake SDK plays two turns — one
// write_scene call, then a closing sentence — and we check what the loop
// shows on the canvas, what it sends back to the model, and what it returns.
const requests: any[] = [];
vi.mock('../src/preview', () => ({ previewPng: async () => 'PNG' }));
vi.mock('@anthropic-ai/sdk', () => {
  const scene = { title: 'Тест', motion: 'mechanical', objects: [{ id: 'a', x: 0, y: 0, z: 14, w: 40, d: 40, h: 40, hover: { z: 30 } }] };
  const turns = [
    { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'write_scene', input: scene }] },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Готов куб, при наведении поднимается.' }] },
  ];
  class Anthropic {
    static APIError = class extends Error {};
    static APIUserAbortError = class extends Error {};
    static AuthenticationError = class extends Error {};
    static RateLimitError = class extends Error {};
    beta = {
      messages: {
        stream: (params: any) => {
          requests.push(structuredClone(params));
          const handlers: Record<string, (...a: any[]) => void> = {};
          const turn = turns[requests.length - 1];
          return {
            on(event: string, fn: (...a: any[]) => void) { handlers[event] = fn; return this; },
            async finalMessage() {
              if (turn.stop_reason === 'tool_use') handlers.inputJson?.('', { title: 'Тест', objects: [scene.objects[0], { id: 'b' }] });
              return turn;
            },
          };
        },
      },
    };
  }
  return { default: Anthropic };
});

describe('generation with an API key', () => {
  it('drafts on the canvas, reports back with a preview, and finishes', async () => {
    const { runWithApi } = await import('../src/ai/api');
    const drafts: { scene: Scene; final: boolean }[] = [];
    const empty: Scene = { version: 2, title: 'Новая', motion: 'mechanical', objects: [] };
    const result = await runWithApi({
      prompt: 'куб', file: 'x', scene: empty, selection: [], signal: new AbortController().signal,
      progress: () => {}, draft: (scene, final) => drafts.push({ scene, final }),
    }, 'sk-test');

    expect(result).toBe('Готов куб, при наведении поднимается.');
    // Partial draft keeps only complete blocks; the final one is the full scene.
    expect(drafts[0]).toMatchObject({ final: false, scene: { objects: [{ id: 'a' }] } });
    expect(drafts.at(-1)).toMatchObject({ final: true, scene: { title: 'Тест', objects: [{ id: 'a', hover: { z: 30 } }] } });
    // The request follows the documented shape for this model.
    expect(requests[0]).toMatchObject({ model: 'claude-opus-5-5', thinking: { type: 'adaptive' }, fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'] });
    expect(requests[0].tools[0]).toMatchObject({ name: 'write_scene', eager_input_streaming: true });
    expect(requests[0].tool_choice).toBeUndefined();
    // The second turn carries the check and the preview image.
    const back = requests[1].messages.at(-1).content[0];
    expect(back).toMatchObject({ type: 'tool_result', tool_use_id: 't1' });
    expect(back.content[0].text).toContain('Ошибок нет');
    expect(back.content[1]).toMatchObject({ type: 'image', source: { data: 'PNG' } });
  });
});

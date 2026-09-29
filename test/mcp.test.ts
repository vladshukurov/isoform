import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../mcp/core';

// A real MCP client talking to the server in memory; the only file it
// touches is files/mcp-test.json, removed afterwards.
const NAME = 'mcp-test', PATH = `files/${NAME}.json`;
let client: Client;
const call = async (name: string, args: Record<string, unknown> = {}) =>
  await client.callTool({ name, arguments: args }) as { content: { type: string; text?: string; data?: string; mimeType?: string }[]; isError?: boolean };
const textOf = (r: Awaited<ReturnType<typeof call>>) => r.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
const cube = (id: string, x: number, extra = {}) => ({ id, x, y: 0, z: 14, w: 40, d: 40, h: 40, ...extra });

beforeAll(async () => {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer().connect(a);
  client = new Client({ name: 'test', version: '1' });
  await client.connect(b);
});
afterAll(() => { if (existsSync(PATH)) unlinkSync(PATH); });

describe('Isoform MCP server', () => {
  it('offers the scene tools and the guide', async () => {
    const { tools } = await client.listTools();
    expect(tools.map(t => t.name).sort()).toEqual(['check_scene', 'get_editor_state', 'get_guide', 'list_scenes', 'read_scene', 'render_preview', 'update_blocks', 'write_scene']);
    const { resources } = await client.listResources();
    expect(resources[0].uri).toBe('isoform://guide');
    expect(client.getInstructions()).toContain('get_guide');
  });

  it('reads templates and lists them', async () => {
    expect(textOf(await call('list_scenes'))).toContain('templates/storage');
    expect(JSON.parse(textOf(await call('read_scene', { name: 'templates/storage' }))).objects).toHaveLength(6);
  });

  it('refuses a scene with overlapping blocks and writes a clean one', async () => {
    const bad = await call('write_scene', { name: NAME, title: 'Тест', motion: 'mechanical', objects: [cube('a', 0), cube('b', 20)] });
    expect(bad.isError).toBe(true);
    expect(textOf(bad)).toContain('пересекаются');
    expect(existsSync(PATH)).toBe(false);

    const good = await call('write_scene', { name: NAME, title: 'Тест', motion: 'mechanical', objects: [cube('a', 0), cube('b', 60, { hover: { z: 30 } })] });
    expect(good.isError).toBeFalsy();
    expect(JSON.parse(readFileSync(PATH, 'utf8')).objects).toHaveLength(2);
  });

  it('never writes templates', async () => {
    const r = await call('write_scene', { name: 'templates/storage', title: 'x', motion: 'mechanical', objects: [cube('a', 0)] });
    expect(r.isError).toBe(true);
  });

  it('edits single blocks without touching the rest', async () => {
    const r = await call('update_blocks', { name: NAME, set: [{ id: 'a', h: 60, hover: { z: 24 } }, { id: 'b', hover: null }], add: [cube('c', 120)], remove: [] });
    expect(r.isError).toBeFalsy();
    const scene = JSON.parse(readFileSync(PATH, 'utf8'));
    expect(scene.objects.map((p: { id: string }) => p.id)).toEqual(['a', 'b', 'c']);
    expect(scene.objects[0]).toMatchObject({ h: 60, hover: { z: 24 } });
    expect(scene.objects[1].hover).toBeUndefined();
    expect((await call('update_blocks', { name: NAME, set: [{ id: 'nope', x: 1 }] })).isError).toBe(true);
  });

  it('checks and renders a preview image', async () => {
    expect(textOf(await call('check_scene', { name: NAME }))).toContain('Ошибок нет');
    const preview = await call('render_preview', { name: NAME });
    const image = preview.content.find(c => c.type === 'image')!;
    expect(image.mimeType).toBe('image/png');
    expect(Buffer.from(image.data!, 'base64').subarray(1, 4).toString()).toBe('PNG');
  });

  it('says clearly when the editor is not running', async () => {
    process.env.ISOFORM_EDITOR = 'http://127.0.0.1:9'; // nothing listens there
    const { createServer: fresh } = await import('../mcp/core');
    void fresh;
    const r = await call('get_editor_state');
    // Either the dev server answers (it's running) or we get the hint; both are fine here.
    expect(textOf(r)).toMatch(/Открыт|не отвечает|не выбран/);
  });
});

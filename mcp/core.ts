// The Isoform MCP server: scenes, checks and previews as tools, so any agent
// (Claude Code, Codex, Cursor, Claude Desktop) can build and edit the series'
// illustrations. Writes go to files/ on disk; an open editor picks them up
// live, and it tells the editor what the agent is doing.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Resvg } from '@resvg/resvg-js';
import { z } from 'zod';
import { list, readFile, root, saveFile, validName } from '../server/files';
import { formatScene } from '../src/format';
import { BOX_KEYS, validateScene, type Piece, type Scene } from '../src/model';
import { previewSvg } from '../src/preview';
import { review } from '../src/review';
import { warnings } from '../src/warnings';

const EDITOR = process.env.ISOFORM_EDITOR ?? 'http://localhost:8790';
const guide = () => readFileSync(resolve(root, 'AGENTS.md'), 'utf8');

const INSTRUCTIONS = `Isoform собирает изометрические иллюстрации серии Passwork из прямоугольных блоков. `
  + `Перед первой сценой прочитай get_guide (формат, наведение, правила серии). Порядок работы: `
  + `посмотри шаблоны (list_scenes, read_scene templates/…), напиши сцену write_scene или поправь update_blocks, `
  + `затем render_preview и посмотри картинку. Если пользователь говорит «это», «выделенное» — вызови get_editor_state.`;

// Tell the open editor what the agent is doing; silent if it isn't running.
function notify(tool: string, file?: string) {
  fetch(`${EDITOR}/api/mcp-activity`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tool, file }), signal: AbortSignal.timeout(800) })
    .catch(() => undefined);
}

function load(name: string): Scene {
  if (name.startsWith('templates/')) {
    const scene = list('templates').scenes.find(s => s.name === name.slice(10))?.scene;
    if (!scene) throw new Error(`Нет шаблона ${name}`);
    return scene;
  }
  if (!validName(name)) throw new Error(`Имя «${name}»: латиница, цифры и дефис`);
  return readFile(name);
}

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
const fail = (t: string) => ({ content: [{ type: 'text' as const, text: t }], isError: true });

function report(scene: Scene) {
  const problems = review(scene), notes = warnings(scene);
  return {
    problems,
    text: [
      problems.length ? `Ошибки:\n${problems.map(p => `✗ ${p}`).join('\n')}` : 'Ошибок нет.',
      notes.length ? `Предупреждения:\n${notes.map(p => `! ${p}`).join('\n')}` : '',
    ].filter(Boolean).join('\n\n'),
  };
}

// Checked before anything reaches disk: a broken scene is never written.
function save(name: string, candidate: unknown) {
  if (!validName(name)) throw new Error(`Имя «${name}»: латиница, цифры и дефис (шаблоны не редактируются)`);
  const scene = validateScene(candidate);
  const { problems, text: check } = report(scene);
  if (problems.length) return fail(`Не записано — исправь и повтори.\n\n${check}`);
  saveFile(name, scene);
  return text(`Записано в files/${name}.json (${scene.objects.length} блоков), открытый редактор уже показывает изменения.\n\n${check}\n\nПосмотри результат: render_preview.`);
}

const box = { x: z.number(), y: z.number(), z: z.number(), w: z.number().positive(), d: z.number().positive(), h: z.number().positive() };
const piece = z.object({
  id: z.string().describe('kebab-case, виден пользователю в слоях'),
  ...box,
  hover: z.object(Object.fromEntries(BOX_KEYS.map(k => [k, z.number().optional()]))).partial().optional().describe('Только изменившиеся при наведении значения, абсолютные'),
  delay: z.number().min(0).optional().describe('Секунды до начала движения'),
}).passthrough();

export function createServer() {
  const server = new McpServer({ name: 'isoform', version: '0.1.0' }, { instructions: INSTRUCTIONS });

  server.registerResource('guide', 'isoform://guide', { title: 'Правила серии и формат сцены', mimeType: 'text/markdown' },
    async uri => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: guide() }] }));

  server.registerTool('get_guide', {
    title: 'Правила и формат',
    description: 'Формат сцены, наведение и правила серии Passwork. Прочитай один раз перед первой сценой.',
    annotations: { readOnlyHint: true },
  }, async () => text(guide()));

  server.registerTool('list_scenes', {
    title: 'Сцены',
    description: 'Файлы пользователя (files/) и шаблоны серии (templates/, только чтение).',
    annotations: { readOnlyHint: true },
  }, async () => {
    const line = (prefix: string) => ({ name, scene }: { name: string; scene: Scene }) => `${prefix}${name} — «${scene.title}», блоков ${scene.objects.length}`;
    const files = list('files'), templates = list('templates');
    return text([
      'Файлы:', ...(files.scenes.length ? files.scenes.map(line('')) : ['(пусто)']),
      ...(files.broken.length ? ['Не читаются:', ...files.broken.map(b => `${b.name}: ${b.error}`)] : []),
      '', 'Шаблоны (read_scene templates/<имя>):', ...templates.scenes.map(line('templates/')),
    ].join('\n'));
  });

  server.registerTool('read_scene', {
    title: 'Прочитать сцену',
    description: 'JSON сцены: имя файла или templates/<имя>.',
    inputSchema: { name: z.string() },
    annotations: { readOnlyHint: true },
  }, async ({ name }) => {
    try { return text(formatScene(load(name))); } catch (error) { return fail((error as Error).message); }
  });

  server.registerTool('write_scene', {
    title: 'Записать сцену',
    description: 'Создать или целиком заменить files/<name>.json. Сначала проверяется: с ошибками (формат, пересечения) не записывается. Порядок objects — порядок отрисовки, от дальних к ближним.',
    inputSchema: {
      name: z.string().describe('Имя файла: латиница, цифры, дефис'),
      title: z.string().describe('Подпись для экранных читалок, по-русски'),
      motion: z.enum(['mechanical', 'layered']),
      objects: z.array(piece),
    },
  }, async ({ name, title, motion, objects }) => {
    notify('write_scene', name);
    try { return save(name, { version: 2, title, motion, objects }); } catch (error) { return fail((error as Error).message); }
  });

  server.registerTool('update_blocks', {
    title: 'Поправить блоки',
    description: 'Точечная правка files/<name>.json: set меняет поля блоков (hover: null убирает наведение), add добавляет блоки в конец порядка отрисовки или перед before, remove удаляет. Остальное не трогается.',
    inputSchema: {
      name: z.string(),
      set: z.array(z.object({ id: z.string(), ...Object.fromEntries(Object.entries(box).map(([k, v]) => [k, v.optional()])), hover: z.union([piece.shape.hover, z.null()]).optional(), delay: z.number().min(0).optional(), rename: z.string().optional() })).optional(),
      add: z.array(piece).optional(),
      before: z.string().optional().describe('Вставить новые блоки перед этим id'),
      remove: z.array(z.string()).optional(),
    },
  }, async ({ name, set = [], add = [], before, remove = [] }) => {
    notify('update_blocks', name);
    try {
      const scene = load(name);
      const missing = [...set.map(s => s.id), ...remove].filter(id => !scene.objects.some(p => p.id === id));
      if (missing.length) return fail(`Нет блоков: ${missing.join(', ')}`);
      let objects = scene.objects.filter(p => !remove.includes(p.id)).map(p => {
        const change = set.find(s => s.id === p.id);
        if (!change) return p;
        const { id: _, rename, hover, ...fields } = change;
        const next: Piece = { ...p, ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)), id: rename || p.id };
        if (hover === null) delete next.hover; else if (hover) next.hover = { ...p.hover, ...hover };
        return next;
      });
      const at = before ? objects.findIndex(p => p.id === before) : -1;
      objects = at < 0 ? [...objects, ...add as Piece[]] : [...objects.slice(0, at), ...add as Piece[], ...objects.slice(at)];
      return save(name, { ...scene, objects });
    } catch (error) { return fail((error as Error).message); }
  });

  server.registerTool('check_scene', {
    title: 'Проверить',
    description: 'Ошибки (формат, пересечения) и предупреждения (парящие блоки, размеры, задержки) сцены.',
    inputSchema: { name: z.string() },
    annotations: { readOnlyHint: true },
  }, async ({ name }) => {
    try { return text(report(load(name)).text); } catch (error) { return fail((error as Error).message); }
  });

  server.registerTool('render_preview', {
    title: 'Превью',
    description: 'PNG в рамке карточки сайта: покой, середина наведения, полное наведение. Смотри на него после каждой правки.',
    inputSchema: { name: z.string() },
    annotations: { readOnlyHint: true },
  }, async ({ name }) => {
    notify('render_preview', name);
    try {
      const png = new Resvg(previewSvg(load(name)), { font: { loadSystemFonts: false }, fitTo: { mode: 'zoom', value: .5 } }).render().asPng();
      return { content: [
        { type: 'image' as const, data: Buffer.from(png).toString('base64'), mimeType: 'image/png' },
        { type: 'text' as const, text: 'Слева покой, в середине — середина наведения (видны задержки), справа — полное наведение.' },
      ] };
    } catch (error) { return fail((error as Error).message); }
  });

  server.registerTool('get_editor_state', {
    title: 'Что открыто в редакторе',
    description: 'Какой файл открыт в редакторе Isoform, что выделено (с блоками) и какая вкладка — «Дизайн» или «Наведение». Вызывай, когда пользователь говорит «это», «выделенное», «тут».',
    annotations: { readOnlyHint: true },
  }, async () => {
    try {
      const state = await fetch(`${EDITOR}/api/state`, { signal: AbortSignal.timeout(1500) }).then(r => r.json()) as { file?: string | null; selection?: string[]; mode?: string };
      if (!state.file) return text('Редактор открыт, но файл не выбран.');
      const scene = load(state.file);
      const picked = scene.objects.filter(p => state.selection?.includes(p.id));
      return text([
        `Открыт files/${state.file}.json «${scene.title}», вкладка ${state.mode === 'hover' ? '«Наведение»' : '«Дизайн»'}.`,
        picked.length ? `Выделено (${picked.length}):\n${picked.map(p => JSON.stringify(p)).join('\n')}` : 'Ничего не выделено.',
      ].join('\n'));
    } catch {
      return fail(`Редактор не отвечает на ${EDITOR}. Запусти его: npm run dev в папке Isoform.`);
    }
  });

  return server;
}

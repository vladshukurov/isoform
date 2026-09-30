// Runs Claude Code headless in the project for in-editor generation. Only the
// local dev server has this; the agent may read, write and run the project's
// check/render/scene scripts, nothing else.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, relative, resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { validateScene } from '../src/model';
import { previewSvg } from '../src/preview';
import { dirs, readFile, root, validName, work } from './files';

// Claude Code may be installed in several places (nvm, brew, the native
// installer); prefer one that is signed in. Found through a login shell too,
// so nvm/brew installs are on PATH.
type Cli = { path: string; version: string; loggedIn: boolean };
let cached: { at: number; cli: Cli | null } | null = null;
const home = process.env.HOME ?? '';
function candidates() {
  const which = spawnSync(process.env.SHELL || '/bin/zsh', ['-lc', 'command -v -a claude'], { encoding: 'utf8' }).stdout.split('\n');
  const nvm = spawnSync('/bin/sh', ['-c', `ls -d ${home}/.nvm/versions/node/*/bin/claude 2>/dev/null`], { encoding: 'utf8' }).stdout.split('\n');
  return [...new Set([...which, `${home}/.claude/local/claude`, `${home}/.local/bin/claude`, '/opt/homebrew/bin/claude', '/usr/local/bin/claude', ...nvm]
    .map(p => p.trim()).filter(p => p && existsSync(p)))];
}
export function claudeCli(): Cli | null {
  if (cached && Date.now() - cached.at < 15000) return cached.cli;
  const found = candidates().map(path => {
    const version = spawnSync(path, ['--version'], { encoding: 'utf8', timeout: 10000 }).stdout.trim();
    let loggedIn = false;
    try { loggedIn = JSON.parse(spawnSync(path, ['auth', 'status'], { encoding: 'utf8', timeout: 10000 }).stdout).loggedIn === true; } catch { /* old CLI */ }
    return { path, version, loggedIn };
  }).filter(c => c.version);
  const cli = found.find(c => c.loggedIn) ?? found[0] ?? null;
  cached = { at: Date.now(), cli };
  return cli;
}

// Signing in from the editor: `claude auth login` opens the browser; after
// signing in the page shows a code, which the editor sends back here.
let login: { child: ReturnType<typeof spawn>; url: string; done: Promise<void> } | null = null;
export async function startLogin() {
  const cli = claudeCli();
  if (!cli) throw new Error('Claude Code не найден: установите его — npm install -g @anthropic-ai/claude-code');
  if (login) login.child.kill('SIGTERM');
  const child = spawn(cli.path, ['auth', 'login', '--claudeai'], { cwd: root, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
  const done = new Promise<void>(resolve => child.on('close', () => { cached = null; if (login?.child === child) login = null; resolve(); }));
  const url = await new Promise<string>((resolve, reject) => {
    let out = '';
    const timer = setTimeout(() => reject(new Error('Claude Code не ответил')), 15000);
    const read = (chunk: Buffer) => {
      out += chunk.toString();
      const found = out.match(/https:\/\/\S+/);
      if (found) { clearTimeout(timer); resolve(found[0]); }
    };
    child.stdout!.on('data', read);
    child.stderr!.on('data', read);
    child.on('close', () => { clearTimeout(timer); reject(new Error(out.trim().split('\n').at(-1) || 'Вход не запустился')); });
  });
  login = { child, url, done };
  return { url };
}
export async function finishLogin(code: string) {
  if (!login) throw new Error('Сначала нажмите «Войти»');
  const { child, done } = login;
  child.stdin!.write(code.trim() + '\n');
  // Wait for the CLI to trade the code for a token.
  await Promise.race([done, new Promise(r => setTimeout(r, 20000))]);
  if (child.exitCode === null) child.kill('SIGTERM');
  cached = null;
  const cli = claudeCli();
  if (!cli?.loggedIn) throw new Error('Код не подошёл — попробуйте ещё раз');
  return { loggedIn: true };
}

const TOOLS = ['Read', 'Write', 'Edit', 'Bash(npm run check:*)', 'Bash(npm run render:*)'];
// A live run showed where the minutes went: reading the editor's sources,
// writing recipes (no live drafts) and cropping previews with python/sips.
const DENY = ['Skill', 'Task', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'NotebookEdit',
  ...['python', 'python3', 'sips', 'cat', 'ls', 'head', 'tail', 'grep', 'find', 'node', 'npx', 'tsx'].map(c => `Bash(${c}:*)`),
  ...['src', 'scripts', 'server', 'recipes', 'mcp', 'node_modules', 'test'].map(d => `Read(./${d}/**)`)];


const GUARD = 'Ты помогаешь только с этой иллюстрацией. Если просьба не про сцену (здоровье, код, погода, что угодно ещё) — ничего не читай и не трогай файлы, а ответь одной короткой фразой с лёгкой иронией, что ты здесь по иллюстрациям, и предложи, что можно собрать.';
const LAYOUT = 'в формате редактора: каждый блок — одна строка вида {"id":"…","x":…}, в порядке отрисовки от дальних к ближним';
const FORMAT = `Сохраняй сцену инструментом Write целиком (не Edit), ${LAYOUT} — блоки появляются на холсте по мере того, как ты их пишешь.`;
const FOCUS = 'Работай только с файлом сцены и превью: не читай исходники (src/, scripts/, server/, recipes/), не пиши рецепты и скрипты, не обрабатывай картинки — смотри превью как есть. Всё, что нужно знать о формате, — в AGENTS.md.';
const FINISH = 'Последнее сообщение — для дизайнера: одна короткая фраза по-русски о том, что получилось на картинке, без имён файлов, id, чисел, кода и отчёта о проверках. Второй строкой — «Дальше:» и 2–3 короткие правки именно этой сцены, которые стоит попробовать, через « | », каждая до 5 слов, повелительно (например: Дальше: Крышку выше | Ящики волной | Упростить цоколь). Не спрашивай уточнений — реши сам.';
const LOOK = ['storage', 'production'], SAMPLES = ['storage', 'cicd'];

// Previews of the series for Claude to look at; previews/ isn't in git, so
// they're drawn here when missing.
function ensureTemplatePreviews() {
  for (const name of LOOK) {
    const out = resolve(dirs.previews, 'templates', `${name}.png`);
    if (existsSync(out)) continue;
    try {
      const scene = validateScene(JSON.parse(readFileSync(resolve(dirs.templates, `${name}.json`), 'utf8')));
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, new Resvg(previewSvg(scene), { font: { loadSystemFonts: false } }).render().asPng());
    } catch { /* Claude can still read the JSON */ }
  }
}
const sample = (name: string) => { try { return readFileSync(resolve(dirs.templates, `${name}.json`), 'utf8').trim(); } catch { return ''; } };
const lines = (file: string, ids: string[]) => { try { return readFile(file).objects.filter(p => ids.includes(p.id)).map(p => JSON.stringify(p)).join('\n'); } catch { return ''; } };

type Ask = { file: string; prompt: string; selection: string[]; fresh: boolean; hasContent: boolean; followUp: boolean; sketched?: boolean };
// Three kinds of work, each with the process that gives the best result:
// a new scene (look at the series, massing first, then detail, then an
// honest comparison), an edit (quick, the rest untouched) and a detail
// (only the selected blocks, judged on a preview with the rest faded).
function promptFor({ file, prompt, selection, fresh, hasContent, followUp, sketched }: Ask) {
  const where = `Правила серии и формат — в AGENTS.md, он уже у тебя в контексте, не перечитывай его. Файл сцены: ${work}/files/${file}.json (пиши только туда), он открыт в редакторе, пользователь смотрит на холст, пока ты пишешь.`
    + (followUp ? ' Это продолжение разговора; пользователь мог поправить файл руками.' : '') + ' ' + FOCUS;
  if (fresh) return [
    GUARD, where,
    sketched ? 'На холсте уже быстрый набросок формы — его сделала быстрая модель, чтобы пользователь не ждал пустой холст. Прочитай файл: если образ годится — развивай его, если нет — замени целиком.'
      : hasContent ? 'Собери новую сцену с нуля: текущее содержимое файла замени целиком (прочитай файл — этого требует Write — но не опирайся на него).' : 'Файл пустой: собери сцену с нуля.',
    `Задача: ${prompt}`,
    'Как работать, по шагам:',
    `1. Первым делом, не раздумывая, открой ${LOOK.map(n => `previews/templates/${n}.png`).join(' и ')} — так выглядит серия. Данные двух сцен серии — в конце, templates/ больше не читай.`,
    '2. Выбери один ясный образ — предмет, который сразу объясняет задачу. Не повторяй сцены серии. Не перебирай варианты: первый хороший — в работу.',
    '3. Сразу запиши каркас: 3–6 основных объёмов. Пользователь ждёт и смотрит на пустой холст — каждая минута раздумий до каркаса видна. Детали продумаешь, глядя на каркас.',
    '4. Сразу за каркасом — детали, обязательный шаг: доведи до уровня серии, 12–20 блоков. Приёмы серии: цоколь или плита под предметом, корпус, крышка или верхний слой с зазором 10, повторяющиеся детали рядом (3–5 одинаковых: ящики, диски, карточки, засовы), детали на видимых гранях +X и +Y, минимум три уровня по высоте. Запиши файл целиком ещё раз.',
    `5. npm run check ${file} и исправь ошибки. Превью пока не смотри и не шлифуй — на это будет отдельный короткий шаг. Закончи одной фразой.`,
    'Что делает сцену хорошей:',
    '- Главный предмет крупный и читается с первого взгляда; корпуса 120–200 по стороне, как в серии. Без мелочи меньше 10 по двум сторонам.',
    '- Подвижная часть заметная: не меньше четверти главного объёма, ход 20–60, в сторону зрителя (+X, +Y) или вверх — чтобы движение было видно на карточке.',
    '- Подвижная часть из нескольких блоков — одна группа (поле group): у всех её блоков одинаковый сдвиг и одинаковая задержка, в середине движения ничего не разваливается.',
    '- Одно выразительное движение; у повторяющихся деталей — волна задержек с шагом 0.04–0.08.',
    '- Соединения видны: ничто спереди не прячет, где деталь входит в корпус или стоит на плите.',
    FORMAT,
    `Сцены серии:\n${SAMPLES.map(sample).join('\n\n')}`,
  ].filter(Boolean).join('\n');
  if (selection.length) return [
    GUARD, where,
    `Работаем над деталью: выделены блоки ${selection.join(', ')}. Сейчас они такие:\n${lines(file, selection)}`,
    `Задача: ${prompt}`,
    'Прочитай файл. Меняй только выделенные блоки. Если детали нужны новые блоки — добавь их с id от имени детали и поставь рядом с ней в порядке отрисовки. Все остальные строки файла оставь без изменений.',
    FORMAT,
    `Затем npm run check ${file} и npm run render ${file} --focus=<выделенные и новые id через запятую> — на превью остальная сцена приглушена, смотри на деталь в контексте; поправь, если криво.`,
    FINISH,
  ].filter(Boolean).join('\n');
  return [
    GUARD, where,
    'Прочитай файл и поправь его под задачу, всё остальное сохрани как есть. Шаблоны не нужны.',
    `Задача: ${prompt}`,
    FORMAT,
    `Затем npm run check ${file}. Если меняешь силуэт или больше трёх блоков — ещё npm run render ${file} и посмотри превью.`,
    FINISH,
  ].filter(Boolean).join('\n');
}

// What Claude is doing, as a short human line for the editor.
function describe(block: { type: string; name?: string; input?: Record<string, unknown>; text?: string }) {
  if (block.type === 'text' && block.text?.trim()) return { kind: 'text', text: block.text.trim().split('\n')[0].slice(0, 160) };
  if (block.type !== 'tool_use') return null;
  const path = typeof block.input?.file_path === 'string' ? relative(work, block.input.file_path) : '';
  const command = String(block.input?.command ?? '');
  if (block.name === 'Write' || block.name === 'Edit') return null; // announced as it starts, see launch
  if (block.name === 'Read') return { kind: 'tool', text: path.startsWith('templates/') || path.startsWith('previews/templates/') ? 'Смотрит на серию' : path.startsWith('previews/') ? 'Смотрит на результат' : path.startsWith('files/') ? 'Изучает сцену' : 'Читает правила' };
  if (/npm run check/.test(command)) return { kind: 'tool', text: 'Проверяет, что блоки не пересекаются' };
  if (/npm run render/.test(command)) return { kind: 'tool', text: 'Рендерит превью' };
  if (/npm run scene/.test(command)) return { kind: 'tool', text: 'Собирает сцену' };
  if (/templates\//.test(command)) return { kind: 'tool', text: 'Смотрит примеры серии' };
  if (/files\//.test(command)) return { kind: 'tool', text: 'Изучает сцену' };
  return { kind: 'tool', text: 'Осматривается' };
}

// The scene as far as a streaming Write has got: the file's text is a JSON
// string inside the tool input, one block per line, so every complete line
// is a block that can be shown already.
export function partialScene(input: string, path: string) {
  const at = input.indexOf('"content"');
  if (at < 0 || !/"file_path"\s*:\s*"([^"]*)"/.exec(input)?.[1].endsWith(path)) return null;
  const start = input.indexOf('"', input.indexOf(':', at) + 1);
  if (start < 0) return null;
  let text = '';
  for (let i = start + 1; i < input.length; i++) {
    const c = input[i];
    if (c === '"') break;
    if (c !== '\\') { text += c; continue; }
    const e = input[i + 1];
    if (e === undefined) break;
    if (e === 'u') { if (i + 5 >= input.length) break; text += String.fromCharCode(parseInt(input.slice(i + 2, i + 6), 16)); i += 5; continue; }
    text += ({ n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' } as Record<string, string>)[e] ?? e;
    i++;
  }
  const objects: unknown[] = [];
  for (const line of text.split('\n').slice(0, -1)) {
    const trimmed = line.trim().replace(/,$/, '');
    if (!trimmed.startsWith('{"id"')) continue;
    try { objects.push(JSON.parse(trimmed)); } catch { /* not a whole block */ }
  }
  const quoted = /"title"\s*:\s*("(?:[^"\\]|\\.)*")/.exec(text)?.[1];
  const title = quoted ? JSON.parse(quoted) as string : undefined, motion = /"motion"\s*:\s*"(mechanical|layered)"/.exec(text)?.[1];
  return { objects, title, motion };
}

// A run lives on the server, apart from the page that started it: reloading
// or closing the editor doesn't stop Claude, and an editor that opens the
// file again picks the run up where it is (every line so far is replayed).
type Run = { file: string; prompt: string; at: number; stop: () => void; lines: string[]; clients: Set<ServerResponse>; done: boolean };
const runs = new Map<string, Run>();
export const activeRuns = () => [...runs.values()].filter(r => !r.done).map(r => ({ file: r.file, prompt: r.prompt, at: r.at }));

function attach(run: Run, res: ServerResponse) {
  res.statusCode = 200;
  res.setHeader('content-type', 'application/x-ndjson; charset=utf-8');
  for (const line of run.lines) res.write(line);
  if (run.done) return res.end();
  run.clients.add(res);
  res.on('close', () => run.clients.delete(res));
}
export function watchAgent(file: string, res: ServerResponse) {
  const run = runs.get(file);
  if (!run) { res.statusCode = 404; return res.end(JSON.stringify({ error: 'Нет запуска' })); }
  attach(run, res);
}
export function stopAgent(file: string) {
  const run = runs.get(file);
  if (run && !run.done) run.stop();
  return { ok: true };
}

// What a run reports, one event per line to the editor: steps, the scene as
// far as Claude has written it, its session and how it ended.
export type RunEvent =
  | { kind: 'think' | 'tool' | 'text'; text: string }
  | { kind: 'scene'; objects: unknown[]; title?: string; motion?: string }
  | { kind: 'session'; text: string }
  | { kind: 'done'; text: string; cost?: number; turns?: number; ms?: number }
  | { kind: 'error'; text: string };
// `model`, `effort` and `sketch: false` are for experiments (npm run eval); the editor uses the defaults.
export type Brief = { file: string; prompt: string; selection?: string[]; fresh?: boolean; session?: string | null; model?: string; effort?: 'low' | 'medium' | 'high'; sketch?: boolean; task?: Task };

// The second pass of a new scene, in the same session: a strict look as the
// series' art director, and the fixes, before the person sees the result.
// A separate review found what the first result missed (a door that barely
// moves, fiddly bits, a silhouette like the safe) — so it happens here.
function reviewFor(file: string) {
  return [
    `Теперь посмотри на результат глазами арт-директора серии: npm run check ${file}, npm run render ${file}, previews/${file}.png (покой, середина наведения, наведение) и рядом previews/templates/storage.png.`,
    'Найди до трёх самых заметных проблем. Проверь по очереди:',
    '1. Все предупреждения check (!) — исправь каждое: мелкие детали убери или сделай крупнее, едва заметное движение сделай ходом 30–60, разваливающиеся группы собери.',
    '2. Образ читается за секунду, с этого ракурса; силуэт не похож на сцены серии (сейф, пресс, стойки серверов).',
    '3. Подвижная часть крупная и её ход виден на карточке: движется в сторону зрителя (+X, +Y) или вверх, не прячется за корпусом.',
    '4. Ничего не висит, не торчит, соединения видны.',
    'Исправь найденное одной записью файла целиком, затем check и render ещё раз и убедись глазами. Если проблем нет — ничего не меняй.',
    FINISH,
  ].join('\n');
}

// A task beside building the scene: tidy the layers without touching the picture.
export type Task = 'build' | 'tidy';
function tidyFor(file: string) {
  const path = `${work}/files/${file}.json`;
  return [
    GUARD, FOCUS,
    `Причеши слои сцены ${path}, не меняя картинку.`,
    '- Дай блокам понятные kebab-case id по смыслу детали: lid, drawer-1, key-ring — а не block-3.',
    '- Составные детали (из нескольких блоков, которые вместе что-то изображают или вместе двигаются) объедини в группы полем group; блоки группы должны стоять подряд в порядке отрисовки — переставляй только так, чтобы не менять, что чем перекрыто.',
    '- Придумай title — короткую подпись по-русски для экранных читалок.',
    '- Координаты, размеры, hover и delay не меняй ни на единицу.',
    `Прочитай файл, запиши его целиком одним Write, затем npm run check ${file}.`,
    'Последнее сообщение — одна короткая фраза по-русски, что стало понятнее.',
  ].join('\n');
}

// A quick sketch of the form, by a fast model, so the canvas isn't empty
// while the main pass thinks over the idea.
function sketchFor(path: string, prompt: string) {
  return [
    `Задача: ${prompt}`,
    `Одним вызовом Write сразу запиши ${path} — набросок основной формы, 5–10 блоков: ${LAYOUT}. Формат и правила серии — в AGENTS.md: земля z = 14, сетка 10, сцена в пределах ±150 по X и Y, блоки не пересекаются; title — два-три слова о главном образе.`,
    'Поле hover не нужно.',
    'Ничего не читай, ничего не проверяй и не объясняй. После записи ответь одним словом: готово.',
  ].filter(Boolean).join('\n');
}


type Pass = { ask: string; model?: string; effort: string; tools: string[]; session: string | null; firstWrite: string; env?: Record<string, string> };
// One `claude -p` over the file: its stream turned into the editor's events.
function pass(cli: Cli, p: Pass, file: string, emit: (event: RunEvent) => void) {
  const args = ['-p', p.ask,
    '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--effort', p.effort,
    ...(p.model ? ['--model', p.model] : []),
    '--permission-mode', 'acceptEdits', '--allowedTools', p.tools.join(','), '--disallowedTools', DENY.join(','),
    ...(p.session ? ['--resume', p.session] : [])];
  const child = spawn(cli.path, args, { cwd: work, env: { ...process.env, ...p.env }, stdio: ['ignore', 'pipe', 'pipe'] });

  let buffer = '', errors = '', sessionId = p.session, ended = false, writes = 0, thought = '', said = '', lastDisk = '';
  // Tool input streaming in, per content block, and how many blocks were last shown.
  const inputs = new Map<number, { name: string; json: string; shown: number }>();
  child.stdout!.setEncoding('utf8').on('data', (chunk: string) => {
    buffer += chunk;
    let at: number;
    while ((at = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, at);
      buffer = buffer.slice(at + 1);
      try {
        const event = JSON.parse(line);
        if (typeof event.session_id === 'string') sessionId = event.session_id;
        if (event.type === 'stream_event') {
          const e = event.event;
          if (e?.type === 'content_block_start' && e.content_block?.type === 'tool_use') {
            inputs.set(e.index, { name: e.content_block.name, json: '', shown: -1 });
            if (e.content_block.name === 'Write') { writes++; emit({ kind: 'tool', text: writes === 1 ? p.firstWrite : 'Дорабатывает детали' }); }
          }
          if (e?.type === 'content_block_start' && e.content_block?.type === 'thinking') { thought = ''; emit({ kind: 'think', text: 'Думает' }); }
          // Where the thinking is streamed, its latest whole sentence is the step line.
          if (e?.type === 'content_block_delta' && e.delta?.type === 'thinking_delta' && typeof e.delta.thinking === 'string') {
            thought += e.delta.thinking;
            const sentences = thought.split(/(?<=[.!?…])\s+/).filter(x => x.trim().length > 12);
            const last = sentences.length > 1 ? sentences.at(-2)!.trim() : '';
            if (last && last !== said) { said = last; emit({ kind: 'think', text: last.replace(/\*\*/g, '').slice(0, 140) }); }
          }
          if (e?.type === 'content_block_delta' && e.delta?.type === 'input_json_delta') {
            const block = inputs.get(e.index);
            if (block?.name === 'Write') {
              block.json += e.delta.partial_json;
              const scene = partialScene(block.json, `files/${file}.json`);
              if (scene && scene.objects.length !== block.shown) { block.shown = scene.objects.length; emit({ kind: 'scene', ...scene }); }
            }
          }
          continue;
        }
        if (event.type === 'assistant') for (const block of event.message?.content ?? []) { const step = describe(block); if (step) emit(step as RunEvent); }
        // After every tool the file as it is on disk: the drafts show whatever
        // way the model wrote the JSON (the streamed parse wants a block per line).
        if (event.type === 'user') {
          try {
            const scene = readFile(file), text = JSON.stringify(scene);
            if (text !== lastDisk) { lastDisk = text; emit({ kind: 'scene', objects: scene.objects, title: scene.title, motion: scene.motion }); }
          } catch { /* not written yet, or mid-write */ }
        }
        if (event.type === 'result') {
          ended = true;
          if (sessionId) emit({ kind: 'session', text: sessionId });
          emit(event.is_error
            ? { kind: 'error', text: String(event.result ?? 'Ошибка агента') }
            : { kind: 'done', text: String(event.result ?? '').trim().split('\n').filter(l => l.trim()).slice(-3).join('\n'), cost: event.total_cost_usd, turns: event.num_turns, ms: event.duration_ms });
        }
      } catch { /* a partial or non-JSON line */ }
    }
  });
  child.stderr!.setEncoding('utf8').on('data', (chunk: string) => { errors += chunk; });
  const exited = new Promise<void>(done => child.on('close', code => {
    if (!ended) emit(code === null || code === 143 ? { kind: 'done', text: 'Остановлено' } : { kind: 'error', text: errors.trim().split('\n').at(-1) || `Claude Code завершился с кодом ${code}` });
    done();
  }));
  return { child, exited };
}

// Claude Code working on one file, headless, in the workspace. A new scene may
// start with a sketch by a fast model; then the main pass. `emit` hears
// everything; `stop` ends whichever pass is running.
export function launch(brief: Brief, emit: (event: RunEvent) => void) {
  const { file, prompt, fresh = false, session = null } = brief;
  const selection = fresh ? [] : brief.selection ?? [];
  const cli = claudeCli();
  if (!cli) throw new Error('Claude Code не найден: установите его или выберите ключ API');
  if (!cli.loggedIn) throw new Error('Claude Code не авторизован: выполните в терминале claude и войдите через /login');
  const contentNow = () => { try { return readFile(file).objects.length > 0; } catch { return false; } };
  if (fresh) ensureTemplatePreviews();
  let current: ReturnType<typeof spawn> | null = null, stopped = false;
  if (brief.task === 'tidy') {
    const t = pass(cli, {
      ask: tidyFor(file), effort: 'low', tools: ['Read', 'Write', 'Bash(npm run check:*)'],
      session: null, firstWrite: 'Переименовывает и группирует',
    }, file, emit);
    return { stop: () => t.child.kill('SIGTERM'), exited: t.exited };
  }
  const exited = (async () => {
    let sketched = false;
    if (fresh && brief.sketch !== false && !contentNow()) {
      // The sketch shows its blocks and steps; its end, session and errors are its own.
      // Thinking capped: measured, the sketch then lands in about ten seconds.
      const s = pass(cli, { ask: sketchFor(`${work}/files/${file}.json`, prompt), model: 'haiku', effort: 'low', tools: ['Write'], session: null, firstWrite: 'Набрасывает форму', env: { MAX_THINKING_TOKENS: '1024' } }, file,
        e => { if (e.kind === 'scene' || e.kind === 'tool') emit(e); });
      current = s.child;
      await s.exited;
      if (stopped) return emit({ kind: 'done', text: 'Остановлено' });
      sketched = contentNow();
    }
    const hasContent = contentNow();
    // Two live runs: low effort from scratch saved three minutes but skipped
    // the detail pass and looked worse; the silent start stayed either way.
    let mainSession: string | null = null, lastSaid = '';
    const main = pass(cli, {
      ask: promptFor({ file, prompt, selection, fresh, hasContent, followUp: !!session, sketched }),
      model: brief.model, effort: brief.effort ?? (fresh ? 'medium' : 'low'), tools: TOOLS, session,
      firstWrite: fresh ? (sketched ? 'Строит сцену' : 'Ставит каркас') : selection.length ? 'Правит деталь' : 'Расставляет блоки',
    }, file, e => {
      // A new scene continues in a second pass: its end and session wait for that.
      if (fresh && e.kind === 'session') { mainSession = e.text; return; }
      if (fresh && e.kind === 'done' && e.text !== 'Остановлено') { lastSaid = e.text; return; }
      emit(e);
    });
    current = main.child;
    await main.exited;
    // A new scene gets one quick look at its preview, in the same conversation.
    if (fresh && !stopped && mainSession && contentNow()) {
      const review = pass(cli, { ask: reviewFor(file), model: brief.model, effort: 'medium', tools: TOOLS, session: mainSession, firstWrite: 'Исправляет найденное' }, file,
        e => { if (e.kind !== 'error') emit(e); else emit({ kind: 'done', text: lastSaid }); });
      current = review.child;
      await review.exited;
    }
  })();
  return { stop: () => { stopped = true; current?.kill('SIGTERM'); }, exited };
}

export async function runAgent(_req: IncomingMessage, res: ServerResponse, body: { file?: unknown; prompt?: unknown; selection?: unknown; fresh?: unknown; session?: unknown; task?: unknown }) {
  if (!validName(body.file) || typeof body.prompt !== 'string' || !body.prompt.trim()) throw new Error('Нужны файл и задача');
  const file = body.file;
  // One run per file: a second request joins the one already going.
  const going = runs.get(file);
  if (going && !going.done) return attach(going, res);
  const run: Run = { file, prompt: body.prompt, at: Date.now(), stop: () => undefined, lines: [], clients: new Set(), done: false };
  const emit = (event: RunEvent) => {
    // Only the latest draft matters to a late joiner; keep the replay short.
    if (event.kind === 'scene') { const at = run.lines.findIndex(l => l.startsWith('{"kind":"scene"')); if (at >= 0) run.lines.splice(at, 1); }
    const line = JSON.stringify(event) + '\n';
    run.lines.push(line);
    for (const c of run.clients) c.write(line);
  };
  const { stop, exited } = launch({
    file, prompt: body.prompt, fresh: body.fresh === true && !body.task,
    task: body.task === 'tidy' ? 'tidy' : 'build',
    selection: Array.isArray(body.selection) ? body.selection.filter((s): s is string => typeof s === 'string') : [],
    session: typeof body.session === 'string' && /^[\w-]+$/.test(body.session) ? body.session : null,
  }, emit);
  run.stop = stop;
  runs.set(file, run);
  attach(run, res);
  await exited;
  run.done = true;
  for (const c of run.clients) c.end();
  run.clients.clear();
  // A finished run is kept a little for an editor reopening just now.
  setTimeout(() => { if (runs.get(file) === run) runs.delete(file); }, 30000);
}

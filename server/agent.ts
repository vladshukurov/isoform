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
import { launchCodex } from './codex';
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
export type AgentId = 'claude' | 'codex';

const GUARD = 'Ты помогаешь только с этой иллюстрацией. Если просьба не про сцену (здоровье, код, погода, что угодно ещё) — ничего не читай и не трогай файлы, а ответь одной короткой фразой с лёгкой иронией, что ты здесь по иллюстрациям, и предложи, что можно собрать.';
const LAYOUT = 'в формате редактора: каждый блок — одна строка вида {"id":"…","x":…}, в порядке отрисовки от дальних к ближним';
const FORMAT: Record<AgentId, string> = {
  claude: `Сохраняй сцену инструментом Write целиком (не Edit), ${LAYOUT} — блоки появляются на холсте по мере того, как ты их пишешь.`,
  codex: `Сохраняй сцену, перезаписывая файл целиком, ${LAYOUT} — пользователь видит каждую запись на холсте.`,
};
const FOCUS = 'Работай только с файлом сцены и превью: не читай исходники (src/, scripts/, server/, recipes/), не пиши рецепты и скрипты, не обрабатывай картинки — смотри превью как есть. Всё, что нужно знать о формате, — в AGENTS.md.';
const FINISH = 'Последнее сообщение — для дизайнера: одна короткая фраза по-русски о том, что получилось на картинке, без имён файлов, id, чисел, кода и отчёта о проверках. Не спрашивай уточнений — реши сам.';
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

type Ask = { file: string; prompt: string; selection: string[]; fresh: boolean; hasContent: boolean; followUp: boolean; agent: AgentId };
// Three kinds of work, each with the process that gives the best result:
// a new scene (look at the series, massing first, then detail, then an
// honest comparison), an edit (quick, the rest untouched) and a detail
// (only the selected blocks, judged on a preview with the rest faded).
function promptFor({ file, prompt, selection, fresh, hasContent, followUp, agent }: Ask) {
  const where = `Правила серии и формат — в AGENTS.md, он уже у тебя в контексте, не перечитывай его. Файл сцены: files/${file}.json, он открыт в редакторе, пользователь смотрит на холст, пока ты пишешь.`
    + (followUp ? ' Это продолжение разговора; пользователь мог поправить файл руками.' : '') + ' ' + FOCUS;
  if (fresh) return [
    GUARD, where,
    hasContent ? 'Собери новую сцену с нуля: текущее содержимое файла замени целиком (прочитай файл — этого требует Write — но не опирайся на него).' : 'Файл пустой: собери сцену с нуля.',
    `Задача: ${prompt}`,
    'Как работать, по шагам:',
    `1. Посмотри на серию глазами: ${LOOK.map(n => `previews/templates/${n}.png`).join(' и ')}. Данные двух сцен серии — в конце, templates/ больше не читай.`,
    '2. Выбери один ясный образ — предмет, который сразу объясняет задачу. Не повторяй сцены серии. Не перебирай варианты: первый хороший — в работу.',
    '3. Сразу запиши каркас: 3–6 основных объёмов. Пользователь ждёт и смотрит на пустой холст — каждая минута раздумий до каркаса видна. Детали продумаешь, глядя на каркас.',
    `4. npm run check ${file} и npm run render ${file}, посмотри previews/${file}.png.`,
    '5. Детали — обязательный шаг: доведи до уровня серии, 12–20 блоков. Приёмы серии: цоколь или плита под предметом, корпус, крышка или верхний слой с зазором 10, повторяющиеся детали рядом (3–5 одинаковых: ящики, диски, карточки, засовы), детали на видимых гранях +X и +Y, минимум три уровня по высоте. Одно выразительное движение при наведении, у повторяющихся деталей — волна задержек. Запиши файл целиком ещё раз.',
    `6. Снова check и render; сравни с картинками серии честно: читается ли образ, богаче ли он простого ящика, баланс, аккуратность соединений, правдоподобность движения. Если не дотягивает — поправь и повтори. Смотри превью только через Read.`,
    FORMAT[agent], FINISH,
    `Сцены серии:\n${SAMPLES.map(sample).join('\n\n')}`,
  ].filter(Boolean).join('\n');
  if (selection.length) return [
    GUARD, where,
    `Работаем над деталью: выделены блоки ${selection.join(', ')}. Сейчас они такие:\n${lines(file, selection)}`,
    `Задача: ${prompt}`,
    'Прочитай файл. Меняй только выделенные блоки. Если детали нужны новые блоки — добавь их с id от имени детали и поставь рядом с ней в порядке отрисовки. Все остальные строки файла оставь без изменений.',
    FORMAT[agent],
    `Затем npm run check ${file} и npm run render ${file} --focus=<выделенные и новые id через запятую> — на превью остальная сцена приглушена, смотри на деталь в контексте; поправь, если криво.`,
    FINISH,
  ].filter(Boolean).join('\n');
  return [
    GUARD, where,
    'Прочитай файл и поправь его под задачу, всё остальное сохрани как есть. Шаблоны не нужны.',
    `Задача: ${prompt}`,
    FORMAT[agent],
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
type Run = { file: string; prompt: string; at: number; child: ReturnType<typeof spawn>; lines: string[]; clients: Set<ServerResponse>; done: boolean };
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
  if (run && !run.done) run.child.kill('SIGTERM');
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
export type Brief = { file: string; prompt: string; selection?: string[]; fresh?: boolean; session?: string | null; agent?: AgentId; model?: 'opus' | 'sonnet' };

// An agent working on one file, headless, in the workspace: Claude Code by
// default, or Codex. Resolves when it exits; `emit` hears everything on the way.
export function launch(brief: Brief, emit: (event: RunEvent) => void) {
  const { file, prompt, fresh = false, session = null, agent = 'claude' } = brief;
  const selection = fresh ? [] : brief.selection ?? [];
  let hasContent = false;
  try { hasContent = readFile(file).objects.length > 0; } catch { /* a new file */ }
  if (fresh) ensureTemplatePreviews();
  const ask = promptFor({ file, prompt, selection, fresh, hasContent, followUp: !!session, agent });
  if (agent === 'codex') return launchCodex(ask, { fresh, session }, emit);
  const cli = claudeCli();
  if (!cli) throw new Error('Claude Code не найден: установите его или выберите ключ API');
  if (!cli.loggedIn) throw new Error('Claude Code не авторизован: выполните в терминале claude и войдите через /login');
  // Two live runs: low effort from scratch saved three minutes but skipped the
  // detail pass and looked worse; the silent start stayed either way. So a
  // new scene gets medium effort, edits low; Sonnet is the faster choice.
  const args = ['-p', ask,
    '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--effort', fresh ? 'medium' : 'low',
    ...(brief.model ? ['--model', brief.model] : []),
    '--permission-mode', 'acceptEdits', '--allowedTools', TOOLS.join(','), '--disallowedTools', DENY.join(','),
    ...(session ? ['--resume', session] : [])];
  const child = spawn(cli.path, args, { cwd: work, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });

  let buffer = '', errors = '', sessionId = session, ended = false, writes = 0, thought = '', said = '';
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
            if (e.content_block.name === 'Write') { writes++; emit({ kind: 'tool', text: writes === 1 ? (fresh ? 'Ставит каркас' : selection.length ? 'Правит деталь' : 'Расставляет блоки') : 'Дорабатывает детали' }); }
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
        if (event.type === 'result') {
          ended = true;
          if (sessionId) emit({ kind: 'session', text: sessionId });
          emit(event.is_error
            ? { kind: 'error', text: String(event.result ?? 'Ошибка агента') }
            : { kind: 'done', text: String(event.result ?? '').trim().split('\n').slice(-2).join(' '), cost: event.total_cost_usd, turns: event.num_turns, ms: event.duration_ms });
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

export async function runAgent(_req: IncomingMessage, res: ServerResponse, body: { file?: unknown; prompt?: unknown; selection?: unknown; fresh?: unknown; session?: unknown; agent?: unknown; model?: unknown }) {
  if (!validName(body.file) || typeof body.prompt !== 'string' || !body.prompt.trim()) throw new Error('Нужны файл и задача');
  const file = body.file;
  // One run per file: a second request joins the one already going.
  const going = runs.get(file);
  if (going && !going.done) return attach(going, res);
  const run: Run = { file, prompt: body.prompt, at: Date.now(), child: null!, lines: [], clients: new Set(), done: false };
  const emit = (event: RunEvent) => {
    // Only the latest draft matters to a late joiner; keep the replay short.
    if (event.kind === 'scene') { const at = run.lines.findIndex(l => l.startsWith('{"kind":"scene"')); if (at >= 0) run.lines.splice(at, 1); }
    const line = JSON.stringify(event) + '\n';
    run.lines.push(line);
    for (const c of run.clients) c.write(line);
  };
  const { child, exited } = launch({
    file, prompt: body.prompt, fresh: body.fresh === true, agent: body.agent === 'codex' ? 'codex' : 'claude',
    model: body.model === 'sonnet' || body.model === 'opus' ? body.model : undefined,
    selection: Array.isArray(body.selection) ? body.selection.filter((s): s is string => typeof s === 'string') : [],
    session: typeof body.session === 'string' && /^[\w-]+$/.test(body.session) ? body.session : null,
  }, emit);
  run.child = child;
  runs.set(file, run);
  attach(run, res);
  await exited;
  run.done = true;
  for (const c of run.clients) c.end();
  run.clients.clear();
  // A finished run is kept a little for an editor reopening just now.
  setTimeout(() => { if (runs.get(file) === run) runs.delete(file); }, 30000);
}

// Runs Claude Code headless in the project for in-editor generation. Only the
// local dev server has this; the agent may read, write and run the project's
// check/render/scene scripts, nothing else.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { relative, resolve } from 'node:path';
import { root, validName } from './files';

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

const TOOLS = ['Read', 'Write', 'Edit', 'Bash(npm run check:*)', 'Bash(npm run render:*)', 'Bash(npm run scene:*)'];

const GUARD = 'Ты помогаешь только с этой иллюстрацией. Если просьба не про сцену (здоровье, код, погода, что угодно ещё) — ничего не читай и не трогай файлы, а ответь одной короткой фразой с лёгкой иронией, что ты здесь по иллюстрациям, и предложи, что можно собрать.';
const FORMAT = 'Сохраняй сцену инструментом Write целиком (не Edit), в формате редактора: каждый блок — одна строка вида {"id":"…","x":…}, в порядке отрисовки от дальних к ближним — блоки появляются на холсте по мере того, как ты их пишешь.';
const FINISH = 'Последнее сообщение — для дизайнера: одна короткая фраза по-русски о том, что изменилось на картинке, без имён файлов, id, чисел, кода и отчёта о проверках. Не спрашивай уточнений — реши сам.';

// One scene from the series, inlined for new scenes so Claude needn't go looking.
const sample = () => { try { return readFileSync(resolve(root, 'templates', 'storage.json'), 'utf8').trim(); } catch { return ''; } };

// Speed matters: the person watches the canvas. AGENTS.md is already in
// context (CLAUDE.md imports it); a small edit needs only the check, a new
// scene also a look at its preview.
function promptFor({ file, prompt, selection, fresh, followUp }: { file: string; prompt: string; selection: string[]; fresh: boolean; followUp: boolean }) {
  const picked = selection.length ? `Выделены блоки: ${selection.join(', ')} — задача про них.` : '';
  const verify = fresh
    ? `Затем npm run check ${file}, npm run render ${file} и посмотри previews/${file}.png; поправь, если криво.`
    : `Затем npm run check ${file}. Render и превью — только если меняешь больше трёх блоков или силуэт.`;
  if (followUp) return [GUARD, `Продолжаем: files/${file}.json. Пользователь мог поправить его руками — прочитай файл перед записью.`, picked, `Задача: ${prompt}`, FORMAT, verify, FINISH].filter(Boolean).join('\n');
  return [
    GUARD,
    `Правила серии и формат — в AGENTS.md, он уже у тебя в контексте, не перечитывай его. Файл сцены: files/${file}.json, он открыт в редакторе, пользователь смотрит на холст, пока ты пишешь.`,
    fresh ? `Файл пустой: собери сцену с нуля. Образец из серии — ниже, templates/ читать не нужно:\n${sample()}` : 'Прочитай файл и поправь его, сохраняя то, что задача не затрагивает. Шаблоны не нужны.',
    'Не читай исходники редактора (src/, scripts/, server/).',
    picked, `Задача: ${prompt}`, FORMAT, verify, FINISH,
  ].filter(Boolean).join('\n');
}

// What Claude is doing, as a short human line for the editor.
function describe(block: { type: string; name?: string; input?: Record<string, unknown>; text?: string }) {
  if (block.type === 'text' && block.text?.trim()) return { kind: 'text', text: block.text.trim().split('\n')[0].slice(0, 160) };
  if (block.type !== 'tool_use') return null;
  const path = typeof block.input?.file_path === 'string' ? relative(root, block.input.file_path) : '';
  const command = String(block.input?.command ?? '');
  if (block.name === 'Write' || block.name === 'Edit') return { kind: 'tool', text: 'Расставляет блоки' };
  if (block.name === 'Read') return { kind: 'tool', text: path.startsWith('templates/') ? 'Смотрит примеры серии' : path.startsWith('previews/') ? 'Смотрит на картинку' : path.startsWith('files/') ? 'Изучает сцену' : 'Читает правила' };
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
type Run = { file: string; prompt: string; child: ReturnType<typeof spawn>; lines: string[]; clients: Set<ServerResponse>; done: boolean };
const runs = new Map<string, Run>();
export const activeRuns = () => [...runs.values()].filter(r => !r.done).map(r => ({ file: r.file, prompt: r.prompt }));

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

export async function runAgent(_req: IncomingMessage, res: ServerResponse, body: { file?: unknown; prompt?: unknown; selection?: unknown; fresh?: unknown; session?: unknown }) {
  const cli = claudeCli();
  if (!cli) throw new Error('Claude Code не найден: установите его или выберите ключ API');
  if (!cli.loggedIn) throw new Error('Claude Code не авторизован: выполните в терминале claude и войдите через /login');
  if (!validName(body.file) || typeof body.prompt !== 'string' || !body.prompt.trim()) throw new Error('Нужны файл и задача');
  const file = body.file;
  // One run per file: a second request joins the one already going.
  const going = runs.get(file);
  if (going && !going.done) return attach(going, res);
  const selection = Array.isArray(body.selection) ? body.selection.filter((s): s is string => typeof s === 'string') : [];
  const session = typeof body.session === 'string' && /^[\w-]+$/.test(body.session) ? body.session : null;
  const args = ['-p', promptFor({ file, prompt: body.prompt, selection, fresh: body.fresh === true, followUp: !!session }),
    '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--permission-mode', 'acceptEdits', '--allowedTools', TOOLS.join(','), '--disallowedTools', 'Skill,Task',
    ...(session ? ['--resume', session] : [])];
  const child = spawn(cli.path, args, { cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  const run: Run = { file, prompt: body.prompt, child, lines: [], clients: new Set(), done: false };
  runs.set(file, run);
  const emit = (event: object) => { const line = JSON.stringify(event) + '\n'; run.lines.push(line); for (const c of run.clients) c.write(line); };
  const send = (step: { kind: string; text: string }) => emit(step);
  attach(run, res);

  let buffer = '', errors = '', sessionId = session, ended = false;
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
          if (e?.type === 'content_block_start' && e.content_block?.type === 'tool_use') inputs.set(e.index, { name: e.content_block.name, json: '', shown: -1 });
          if (e?.type === 'content_block_start' && e.content_block?.type === 'thinking') send({ kind: 'think', text: 'Думает' });
          if (e?.type === 'content_block_delta' && e.delta?.type === 'input_json_delta') {
            const block = inputs.get(e.index);
            if (block?.name === 'Write') {
              block.json += e.delta.partial_json;
              const scene = partialScene(block.json, `files/${file}.json`);
              // Only the latest draft matters to a late joiner; keep the replay short.
              if (scene && scene.objects.length !== block.shown) {
                block.shown = scene.objects.length;
                const at = run.lines.findIndex(l => l.startsWith('{"kind":"scene"'));
                if (at >= 0) run.lines.splice(at, 1);
                emit({ kind: 'scene', ...scene });
              }
            }
          }
          continue;
        }
        if (event.type === 'assistant') for (const block of event.message?.content ?? []) { const step = describe(block); if (step) send(step); }
        if (event.type === 'result') {
          ended = true;
          if (sessionId) emit({ kind: 'session', text: sessionId });
          send(event.is_error ? { kind: 'error', text: String(event.result ?? 'Ошибка агента') } : { kind: 'done', text: String(event.result ?? '').trim().split('\n').slice(-2).join(' ') });
        }
      } catch { /* a partial or non-JSON line */ }
    }
  });
  child.stderr!.setEncoding('utf8').on('data', (chunk: string) => { errors += chunk; });
  child.on('close', code => {
    if (!ended) send(code === null || code === 143 ? { kind: 'done', text: 'Остановлено' } : { kind: 'error', text: errors.trim().split('\n').at(-1) || `Claude Code завершился с кодом ${code}` });
    run.done = true;
    for (const c of run.clients) c.end();
    run.clients.clear();
    // A finished run is kept a little for an editor reopening just now.
    setTimeout(() => { if (runs.get(file) === run) runs.delete(file); }, 30000);
  });
}

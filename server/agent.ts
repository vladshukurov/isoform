// Runs Claude Code headless in the project for in-editor generation. Only the
// local dev server has this; the agent may read, write and run the project's
// check/render/scene scripts, nothing else.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { relative } from 'node:path';
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

const TOOLS = ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'Bash(npm run check:*)', 'Bash(npm run render:*)', 'Bash(npm run scene:*)'];

function promptFor({ file, prompt, selection, fresh, followUp }: { file: string; prompt: string; selection: string[]; fresh: boolean; followUp: boolean }) {
  if (followUp) return [
    `Продолжаем: files/${file}.json, пользователь мог поправить его руками — перечитай перед правкой.`,
    selection.length ? `Выделены блоки: ${selection.join(', ')}.` : '',
    `Задача: ${prompt}`,
    'Как и раньше: Write целиком, check и render, в конце одно-два предложения.',
  ].filter(Boolean).join('\n');
  return [
    `Работай по AGENTS.md. Файл сцены: files/${file}.json — он открыт в редакторе, пользователь смотрит на холст, пока ты пишешь.`,
    fresh ? 'Файл пустой или новый: собери сцену с нуля.' : 'Правь этот файл, сохраняя то, что задача не затрагивает.',
    'Сохраняй сцену инструментом Write целиком (не Edit), в формате редактора: каждый блок — одна строка вида {"id":"…","x":…}, в порядке отрисовки от дальних к ближним — блоки появляются на холсте по мере того, как ты их пишешь.',
    selection.length ? `Выделены блоки: ${selection.join(', ')} — задача про них.` : '',
    `Задача: ${prompt}`,
    `Перед концом: npm run check ${file}, npm run render ${file} и посмотри previews/${file}.png. Не спрашивай уточнений — реши сам. В конце одно-два предложения по-русски, что сделал.`,
  ].filter(Boolean).join('\n');
}

// What the agent is doing, as one short line for the editor.
function describe(block: { type: string; name?: string; input?: Record<string, unknown>; text?: string }) {
  if (block.type === 'text' && block.text?.trim()) return { kind: 'text', text: block.text.trim().split('\n')[0].slice(0, 160) };
  if (block.type !== 'tool_use') return null;
  const path = typeof block.input?.file_path === 'string' ? relative(root, block.input.file_path) : '';
  if (block.name === 'Write' || block.name === 'Edit') return { kind: 'tool', text: `Пишет ${path}` };
  if (block.name === 'Read') return { kind: 'tool', text: `Читает ${path}` };
  if (block.name === 'Bash') return { kind: 'tool', text: String(block.input?.command ?? '') };
  return { kind: 'tool', text: block.name ?? '' };
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

export async function runAgent(req: IncomingMessage, res: ServerResponse, body: { file?: unknown; prompt?: unknown; selection?: unknown; fresh?: unknown; session?: unknown }) {
  const cli = claudeCli();
  if (!cli) throw new Error('Claude Code не найден: установите его или выберите ключ API');
  if (!cli.loggedIn) throw new Error('Claude Code не авторизован: выполните в терминале claude и войдите через /login');
  if (!validName(body.file) || typeof body.prompt !== 'string' || !body.prompt.trim()) throw new Error('Нужны файл и задача');
  const selection = Array.isArray(body.selection) ? body.selection.filter((s): s is string => typeof s === 'string') : [];
  const session = typeof body.session === 'string' && /^[\w-]+$/.test(body.session) ? body.session : null;
  const file = body.file;
  const args = ['-p', promptFor({ file, prompt: body.prompt, selection, fresh: body.fresh === true, followUp: !!session }),
    '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--permission-mode', 'acceptEdits', '--allowedTools', TOOLS.join(','), ...(session ? ['--resume', session] : [])];
  const child = spawn(cli.path, args, { cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });

  res.statusCode = 200;
  res.setHeader('content-type', 'application/x-ndjson; charset=utf-8');
  const send = (step: { kind: string; text: string }) => res.write(JSON.stringify(step) + '\n');
  // Stopping in the editor aborts the request; the agent stops with it.
  req.on('close', () => { if (child.exitCode === null) child.kill('SIGTERM'); });

  let buffer = '', errors = '', sessionId = session;
  // Tool input streaming in, per content block, and how many blocks were last shown.
  const inputs = new Map<number, { name: string; json: string; shown: number }>();
  child.stdout.setEncoding('utf8').on('data', chunk => {
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
          if (e?.type === 'content_block_delta' && e.delta?.type === 'input_json_delta') {
            const block = inputs.get(e.index);
            if (block?.name === 'Write') {
              block.json += e.delta.partial_json;
              const scene = partialScene(block.json, `files/${file}.json`);
              if (scene && scene.objects.length !== block.shown) { block.shown = scene.objects.length; res.write(JSON.stringify({ kind: 'scene', ...scene }) + '\n'); }
            }
          }
          continue;
        }
        if (event.type === 'assistant') for (const block of event.message?.content ?? []) { const step = describe(block); if (step) send(step); }
        if (event.type === 'result') {
          if (sessionId) res.write(JSON.stringify({ kind: 'session', text: sessionId }) + '\n');
          send(event.is_error ? { kind: 'error', text: String(event.result ?? 'Ошибка агента') } : { kind: 'done', text: String(event.result ?? '').trim().split('\n').slice(-2).join(' ') });
        }
      } catch { /* a partial or non-JSON line */ }
    }
  });
  child.stderr.setEncoding('utf8').on('data', chunk => { errors += chunk; });
  await new Promise<void>(done => child.on('close', code => {
    if (code && code !== 143 && !res.writableEnded) send({ kind: 'error', text: errors.trim().split('\n').at(-1) || `Claude Code завершился с кодом ${code}` });
    res.end();
    done();
  }));
}

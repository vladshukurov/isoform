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

const TOOLS = ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'Bash(npm run check:*)', 'Bash(npm run render:*)', 'Bash(npm run scene:*)'];

function promptFor({ file, prompt, selection, fresh }: { file: string; prompt: string; selection: string[]; fresh: boolean }) {
  return [
    `Работай по AGENTS.md. Файл сцены: files/${file}.json — он открыт в редакторе, пользователь видит каждое твоё сохранение.`,
    fresh ? 'Файл пустой или новый: собери сцену с нуля.' : 'Правь этот файл, сохраняя то, что задача не затрагивает.',
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

export async function runAgent(req: IncomingMessage, res: ServerResponse, body: { file?: unknown; prompt?: unknown; selection?: unknown; fresh?: unknown }) {
  const cli = claudeCli();
  if (!cli) throw new Error('Claude Code не найден: установите его или выберите ключ API');
  if (!cli.loggedIn) throw new Error('Claude Code не авторизован: выполните в терминале claude и войдите через /login');
  if (!validName(body.file) || typeof body.prompt !== 'string' || !body.prompt.trim()) throw new Error('Нужны файл и задача');
  const selection = Array.isArray(body.selection) ? body.selection.filter((s): s is string => typeof s === 'string') : [];
  const args = ['-p', promptFor({ file: body.file, prompt: body.prompt, selection, fresh: body.fresh === true }),
    '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits', '--allowedTools', TOOLS.join(',')];
  const child = spawn(cli.path, args, { cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });

  res.statusCode = 200;
  res.setHeader('content-type', 'application/x-ndjson; charset=utf-8');
  const send = (step: { kind: string; text: string }) => res.write(JSON.stringify(step) + '\n');
  // Stopping in the editor aborts the request; the agent stops with it.
  req.on('close', () => { if (child.exitCode === null) child.kill('SIGTERM'); });

  let buffer = '', errors = '';
  child.stdout.setEncoding('utf8').on('data', chunk => {
    buffer += chunk;
    let at: number;
    while ((at = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, at);
      buffer = buffer.slice(at + 1);
      try {
        const event = JSON.parse(line);
        if (event.type === 'assistant') for (const block of event.message?.content ?? []) { const step = describe(block); if (step) send(step); }
        if (event.type === 'result') send(event.is_error ? { kind: 'error', text: String(event.result ?? 'Ошибка агента') } : { kind: 'done', text: String(event.result ?? '').trim().split('\n').slice(-2).join(' ') });
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

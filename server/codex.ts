// Codex on this computer, the same way as Claude Code: `codex exec` runs
// headless in the workspace with the person's own ChatGPT sign-in, reads
// AGENTS.md by itself, edits files/<name>.json and runs the check and render
// scripts. The editor sees each write on disk.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { work } from './files';
import type { RunEvent } from './agent';

type Cli = { path: string; version: string; loggedIn: boolean };
let cached: { at: number; cli: Cli | null } | null = null;
const home = process.env.HOME ?? '';

function candidates() {
  const which = spawnSync(process.env.SHELL || '/bin/zsh', ['-lc', 'command -v -a codex'], { encoding: 'utf8' }).stdout.split('\n');
  const nvm = spawnSync('/bin/sh', ['-c', `ls -d ${home}/.nvm/versions/node/*/bin/codex 2>/dev/null`], { encoding: 'utf8' }).stdout.split('\n');
  return [...new Set([...which, '/opt/homebrew/bin/codex', '/usr/local/bin/codex', `${home}/.local/bin/codex`, ...nvm]
    .map(p => p.trim()).filter(p => p && existsSync(p)))];
}

export function codexCli(): Cli | null {
  if (cached && Date.now() - cached.at < 15000) return cached.cli;
  const found = candidates().map(path => {
    const version = spawnSync(path, ['--version'], { encoding: 'utf8', timeout: 10000 }).stdout.trim();
    const status = spawnSync(path, ['login', 'status'], { encoding: 'utf8', timeout: 10000 });
    return { path, version, loggedIn: status.status === 0 && /logged in/i.test(status.stdout + status.stderr) };
  }).filter(c => c.version);
  const cli = found.find(c => c.loggedIn) ?? found[0] ?? null;
  cached = { at: Date.now(), cli };
  return cli;
}

// `codex login` opens the browser and waits on a local port for ChatGPT to
// hand the sign-in back; nothing to paste. The editor polls until it's done.
let login: ReturnType<typeof spawn> | null = null;
export async function startCodexLogin() {
  const cli = codexCli();
  if (!cli) throw new Error('Codex не найден: установите его — npm install -g @openai/codex');
  login?.kill('SIGTERM');
  const child = spawn(cli.path, ['login'], { cwd: work, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  login = child;
  child.on('close', () => { cached = null; if (login === child) login = null; });
  const url = await new Promise<string>((resolve, reject) => {
    let out = '';
    const timer = setTimeout(() => resolve(''), 8000);
    const read = (chunk: Buffer) => {
      out += chunk.toString();
      const found = out.match(/https:\/\/\S+/);
      if (found) { clearTimeout(timer); resolve(found[0]); }
    };
    child.stdout!.on('data', read);
    child.stderr!.on('data', read);
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve('') : reject(new Error(out.trim().split('\n').at(-1) || 'Вход не запустился')); });
  });
  return { url };
}

// One Codex run on one file. The prompt is the same brief Claude gets;
// the events are mapped to the editor's steps.
export function launchCodex(prompt: string, { fresh, session }: { fresh: boolean; session: string | null }, emit: (event: RunEvent) => void) {
  const cli = codexCli();
  if (!cli) throw new Error('Codex не найден: установите его — npm install -g @openai/codex');
  if (!cli.loggedIn) throw new Error('Codex не авторизован: войдите в ChatGPT из редактора или командой codex login');
  const args = ['exec', '--json', '--sandbox', 'workspace-write', '--skip-git-repo-check', '-C', work,
    '-c', 'model_reasoning_effort="low"',
    ...(session ? ['resume', session] : []), prompt];
  const child = spawn(cli.path, args, { cwd: work, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let buffer = '', errors = '', ended = false, said = '', writes = 0;
  const started = Date.now();
  child.stdout!.setEncoding('utf8').on('data', (chunk: string) => {
    buffer += chunk;
    let at: number;
    while ((at = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, at);
      buffer = buffer.slice(at + 1);
      let event: { type?: string; thread_id?: string; item?: { type?: string; text?: string; command?: string; changes?: { path?: string }[] }; error?: { message?: string }; message?: string };
      try { event = JSON.parse(line); } catch { continue; }
      if (event.type === 'thread.started' && event.thread_id) emit({ kind: 'session', text: event.thread_id });
      const item = event.item;
      if (event.type === 'item.started' && item?.type === 'command_execution') emit({ kind: 'tool', text: describe(item.command ?? '') });
      if (event.type === 'item.completed' && item?.type === 'reasoning' && item.text) {
        // Its reasoning summaries read well as the step line: the first sentence, no markdown.
        emit({ kind: 'think', text: item.text.replace(/\*\*/g, '').split('\n').find(Boolean)!.slice(0, 140) });
      }
      if (event.type === 'item.completed' && item?.type === 'file_change') {
        writes++;
        emit({ kind: 'tool', text: writes === 1 ? (fresh ? 'Ставит каркас' : 'Расставляет блоки') : 'Дорабатывает детали' });
      }
      if (event.type === 'item.completed' && item?.type === 'agent_message' && item.text) said = item.text;
      if (event.type === 'turn.completed') { ended = true; emit({ kind: 'done', text: said.trim().split('\n').slice(-2).join(' '), ms: Date.now() - started }); }
      if (event.type === 'turn.failed' || event.type === 'error') { ended = true; emit({ kind: 'error', text: event.error?.message ?? event.message ?? 'Ошибка Codex' }); }
    }
  });
  child.stderr!.setEncoding('utf8').on('data', (chunk: string) => { errors += chunk; });
  const exited = new Promise<void>(done => child.on('close', code => {
    if (!ended) emit(code === null || code === 143 ? { kind: 'done', text: 'Остановлено' } : { kind: 'error', text: errors.trim().split('\n').at(-1) || `Codex завершился с кодом ${code}` });
    done();
  }));
  return { child, exited };
}

function describe(command: string) {
  if (/npm run check/.test(command)) return 'Проверяет, что блоки не пересекаются';
  if (/npm run render/.test(command)) return 'Рендерит превью';
  if (/templates\//.test(command)) return 'Смотрит на серию';
  if (/files\//.test(command)) return 'Изучает сцену';
  return 'Осматривается';
}

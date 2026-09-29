import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { basename, dirname } from 'node:path';
import { activeRuns, claudeCli, finishLogin, runAgent, startLogin, stopAgent, watchAgent } from './agent';
import { codexCli, startCodexLogin } from './codex';
import { deleteFile, dirs, list, readFile, renameFile, root, saveFile, validName } from './files';

const body = (req: IncomingMessage) => new Promise<unknown>((ok, fail) => {
  let data = '';
  req.on('data', chunk => { data += chunk; });
  req.on('end', () => { try { ok(data ? JSON.parse(data) : undefined); } catch (error) { fail(error); } });
});
const send = (res: ServerResponse, status: number, value: unknown) => {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(value));
};

// A tiny local API over files/ and templates/, only in the dev server.
let editorState: { file?: string | null; selection?: string[]; mode?: string; at?: number } = {};
let lastMcp: { tool: string; file?: string; at: number } | null = null;

export function scenesApi(): Plugin {
  return {
    name: 'isoform-files',
    configureServer(server) {
      // Files written from outside (an agent, git) reach the open editor.
      server.watcher.add(dirs.files);
      const notify = (removed: boolean) => (file: string) => {
        const name = basename(file, '.json');
        if (dirname(file) === dirs.files && file.endsWith('.json') && validName(name))
          server.ws.send({ type: 'custom', event: 'isoform:file', data: { name, removed } });
      };
      server.watcher.on('add', notify(false)).on('change', notify(false)).on('unlink', notify(true));
      server.middlewares.use('/api', async (req, res) => {
        try {
          const [, kind, name, action] = (req.url ?? '').split('?')[0].split('/').map(decodeURIComponent);
          if (req.method === 'GET' && kind === 'library') {
            const files = list('files');
            return send(res, 200, { root, node: process.execPath, files: files.scenes, broken: files.broken, templates: list('templates').scenes, mcp: lastMcp });
          }
          // The bridge between agents (MCP) and the open editor: what's open and
          // selected, and what the agent is doing right now.
          if (kind === 'state' && req.method === 'POST') { editorState = { ...((await body(req)) as object), at: Date.now() }; return send(res, 200, { ok: true }); }
          if (kind === 'state' && req.method === 'GET') return send(res, 200, editorState);
          if (kind === 'mcp-activity' && req.method === 'POST') {
            const { tool, file } = ((await body(req)) ?? {}) as { tool?: unknown; file?: unknown };
            lastMcp = { tool: String(tool ?? ''), file: typeof file === 'string' ? file : undefined, at: Date.now() };
            server.ws.send({ type: 'custom', event: 'isoform:mcp', data: lastMcp });
            return send(res, 200, { ok: true });
          }
          if (kind === 'agent' && name === 'login' && req.method === 'POST') return send(res, 200, await startLogin());
          if (kind === 'agent' && name === 'code' && req.method === 'POST') return send(res, 200, await finishLogin(String(((await body(req)) as { code?: unknown } | undefined)?.code ?? '')));
          if (kind === 'agent' && name === 'runs' && req.method === 'GET') return send(res, 200, activeRuns());
          if (kind === 'agent' && name === 'watch' && action && req.method === 'GET') return watchAgent(action, res);
          if (kind === 'agent' && name === 'stop' && action && req.method === 'POST') return send(res, 200, stopAgent(action));
          if (kind === 'agent' && name === 'codex-login' && req.method === 'POST') return send(res, 200, await startCodexLogin());
          if (kind === 'agent' && req.method === 'GET') {
            const cli = claudeCli(), codex = codexCli();
            return send(res, 200, { available: !!cli, loggedIn: !!cli?.loggedIn, version: cli?.version, codex: { available: !!codex, loggedIn: !!codex?.loggedIn, version: codex?.version } });
          }
          if (kind === 'agent' && req.method === 'POST') return await runAgent(req, res, ((await body(req)) ?? {}) as Record<string, unknown>);
          if (kind === 'files' && name) {
            if (req.method === 'GET') return send(res, 200, { scene: readFile(name) });
            if (req.method === 'PUT') { saveFile(name, await body(req)); return send(res, 200, { ok: true }); }
            if (req.method === 'DELETE') { deleteFile(name); return send(res, 200, { ok: true }); }
            if (req.method === 'POST' && action === 'rename') {
              const to = ((await body(req)) as { to?: unknown } | undefined)?.to;
              if (!validName(to)) throw new Error('Нужно новое имя файла');
              renameFile(name, to);
              return send(res, 200, { ok: true });
            }
          }
          send(res, 404, { error: 'Нет такого запроса' });
        } catch (error) {
          send(res, 400, { error: (error as Error).message });
        }
      });
    },
  };
}

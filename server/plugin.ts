import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { basename, dirname } from 'node:path';
import { claudeCli, runAgent } from './agent';
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
            return send(res, 200, { root, files: files.scenes, broken: files.broken, templates: list('templates').scenes });
          }
          if (kind === 'agent' && req.method === 'GET') { const cli = claudeCli(); return send(res, 200, { available: !!cli, loggedIn: !!cli?.loggedIn, version: cli?.version }); }
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

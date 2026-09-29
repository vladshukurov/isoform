import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { exportScene, listScenes, saveScene, siteArtDir } from './files';

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

// A tiny local API over the scenes folder, only in the dev server.
export function scenesApi(): Plugin {
  return {
    name: 'isoform-scenes',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res) => {
        try {
          const [, kind, name] = (req.url ?? '').split('?')[0].split('/').map(decodeURIComponent);
          if (req.method === 'GET' && kind === 'scenes') return send(res, 200, { scenes: listScenes(), siteArtDir });
          if (req.method === 'PUT' && kind === 'scenes' && name) { saveScene(name, await body(req)); return send(res, 200, { ok: true }); }
          if (req.method === 'POST' && kind === 'export' && name) return send(res, 200, { files: exportScene(name) });
          send(res, 404, { error: 'Нет такого запроса' });
        } catch (error) {
          send(res, 400, { error: (error as Error).message });
        }
      });
    },
  };
}

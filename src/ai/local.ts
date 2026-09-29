// Generation through Claude Code on this computer: the dev server runs
// `claude -p` in the project, the agent edits files/<name>.json by AGENTS.md,
// and the editor picks each write up live from disk.
import type { Job, Step } from './job';

import type { Piece } from '../model';

export const localAgent = () => fetch('/api/agent').then(r => r.ok ? r.json() as Promise<{ available: boolean; loggedIn?: boolean; version?: string }> : { available: false }).catch(() => ({ available: false }));

export async function runWithClaudeCode(job: Job) {
  const response = await fetch('/api/agent', {
    method: 'POST', signal: job.signal, headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ file: job.file, prompt: job.prompt, selection: job.selection, fresh: !job.scene.objects.length, session: job.session }),
  });
  if (!response.ok || !response.body) throw new Error((await response.json().catch(() => ({}))).error ?? 'Claude Code не запустился');
  // The server streams one JSON step per line.
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '', result = 'Готово';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let at: number;
    while ((at = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, at).trim();
      buffer = buffer.slice(at + 1);
      if (!line) continue;
      const step = JSON.parse(line) as { kind: Step['kind'] | 'done' | 'error' | 'session' | 'scene'; text: string; objects?: Piece[]; title?: string; motion?: 'mechanical' | 'layered' };
      if (step.kind === 'error') throw new Error(step.text);
      if (step.kind === 'session') { job.onSession?.(step.text); continue; }
      // The scene as far as Claude has written it: blocks written so far
      // replace theirs, the rest of the old scene stays until the file lands.
      if (step.kind === 'scene') {
        const written = step.objects ?? [], at = new Map(written.map(p => [p.id, p]));
        const objects = [...job.scene.objects.map(p => at.get(p.id) ?? p), ...written.filter(p => !job.scene.objects.some(o => o.id === p.id))];
        job.draft({ ...job.scene, title: step.title ?? job.scene.title, motion: step.motion ?? job.scene.motion, objects }, false);
        continue;
      }
      if (step.kind === 'done') result = step.text || result;
      else job.progress(step as Step);
    }
  }
  return result;
}

// Signing in to Claude from the editor: the browser opens, the page shows a code.
export async function startLogin() {
  const r = await fetch('/api/agent/login', { method: 'POST' });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error ?? 'Вход не запустился');
  return body as { url: string };
}
export async function sendLoginCode(code: string) {
  const r = await fetch('/api/agent/code', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error ?? 'Код не подошёл');
}

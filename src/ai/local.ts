// Generation through Claude Code on this computer: the dev server runs
// `claude -p` in the project, the agent edits files/<name>.json by AGENTS.md,
// and the editor picks each write up live from disk.
import type { Job, Step } from './job';

export const localAgent = () => fetch('/api/agent').then(r => r.ok ? r.json() as Promise<{ available: boolean; loggedIn?: boolean; version?: string }> : { available: false }).catch(() => ({ available: false }));

export async function runWithClaudeCode(job: Job) {
  const response = await fetch('/api/agent', {
    method: 'POST', signal: job.signal, headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ file: job.file, prompt: job.prompt, selection: job.selection, fresh: !job.scene.objects.length }),
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
      const step = JSON.parse(line) as { kind: Step['kind'] | 'done' | 'error'; text: string };
      if (step.kind === 'error') throw new Error(step.text);
      if (step.kind === 'done') result = step.text || result;
      else job.progress(step as Step);
    }
  }
  return result;
}

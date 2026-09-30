// Claude in the editor: who does the work (connection), the conversations
// per file (talks) and the run itself. A run is one undo step; its drafts
// land on the canvas as Claude writes them.
import { useEffect, useState, type RefObject } from 'react';
import { BOX_KEYS, hoverBox, type Scene } from '../model';
import { runWithApi } from './api';
import { onDisk, useConnection, type EngineId } from './connection';
import { explain, type Problem } from './errors';
import type { Job, Step } from './job';
import { agentRuns, runWithClaudeCode, stopClaudeCode, watchClaudeCode } from './local';
import { readReview, splitReply, type Remark } from './reply';
import { useTalks } from './talks';

// What the editor lends a run: its files, selection and history.
export type Workspace = {
  loaded: boolean;
  browserOnly: boolean;
  // The open file as rendered, for effects; `current()` for the live value.
  file: string | null;
  current: () => string | null;
  selection: () => string[];
  select: (ids: string[]) => void;
  scene: (file: string) => Scene | undefined;
  // A new empty file, opened.
  create: () => string;
  // Write pending edits to disk, so Claude Code reads what you see.
  save: () => Promise<void>;
  // One undo step before the run.
  checkpoint: () => void;
  // Put a draft on the canvas; `keep` marks it to be saved.
  show: (file: string, scene: Scene, keep: boolean) => void;
  // After the run: drop the undo step if nothing changed; whether it did.
  settle: (file: string, before: Scene) => boolean;
};
// The run in progress, which the editor also reads: while Claude Code writes
// a file, the disk is the truth and the editor never saves over it.
export type Run = { file: string; engine: EngineId; abort: AbortController };
export type JobState = {
  file: string; prompt: string; steps: Step[]; running: boolean; at: number;
  result?: string; next?: string[]; error?: Problem; changed?: boolean;
  // A review's remarks, each with its fix.
  remarks?: Remark[]; task?: 'tidy' | 'review';
};

const STOPPED = 'Остановлено';

export function useClaude(ws: Workspace, run: RefObject<Run | null>) {
  const connection = useConnection(ws.browserOnly);
  const talks = useTalks(ws.file);
  const [open, setOpen] = useState(false);
  const [job, setJob] = useState<JobState | null>(null);
  // The block Claude is writing right now, outlined on the canvas.
  const [live, setLive] = useState<string | null>(null);
  // Building from scratch: the old scene fades until the first draft lands.
  const [rebuilding, setRebuilding] = useState(false);

  const start = async (prompt: string, { fresh = false, watch = false, at = Date.now(), task }: { fresh?: boolean; watch?: boolean; at?: number; task?: 'tidy' | 'review' } = {}) => {
    if (run.current) return;
    const engine: EngineId = watch ? 'local' : connection.engine;
    const file = ws.current() ?? ws.create();
    const scene = ws.scene(file) ?? { version: 2 as const, title: 'Новая иллюстрация', motion: 'mechanical' as const, objects: [] };
    const selection = fresh ? [] : ws.selection();
    const abort = new AbortController();
    // From then on the file is Claude's until the run ends.
    if (onDisk(engine)) await ws.save();
    if (run.current) return;
    run.current = { file, engine, abort };
    ws.checkpoint();
    setJob({ file, prompt, steps: [], running: true, at, task });
    setRebuilding(fresh && scene.objects.length > 0);

    const progress = (step: Step) => setJob(j => j && (j.steps.at(-1)?.text === step.text ? j : { ...j, steps: [...j.steps.slice(-5), step] }));
    const draft = (next: Scene, final: boolean) => {
      if (ws.current() !== file) return;
      // Claude Code writes the file itself: its drafts are only shown, never saved over it.
      const before = ws.scene(file);
      const touched = next.objects.filter(p => !before?.objects.some(o => o.id === p.id && JSON.stringify(o) === JSON.stringify(p)));
      if (touched.length) setLive(touched.at(-1)!.id);
      setRebuilding(false);
      ws.show(file, next, engine === 'api' || final);
    };
    const talk = talks.begin(file, prompt);
    const job: Job = {
      prompt, file, selection, signal: abort.signal, progress, draft,
      // From scratch Claude starts from nothing.
      scene: fresh ? { ...scene, objects: [] } : scene,
      // Tidying and reviewing are side trips: they don't carry the conversation on.
      ...(task ? { task } : { session: talk.session, onSession: (id: string) => talks.setSession(file, talk.id, id) }),
    };
    let outcome: { result?: string; next?: string[]; error?: Problem; remarks?: Remark[] };
    try {
      const result = watch ? await watchClaudeCode(job) : onDisk(engine) ? await runWithClaudeCode(job) : await runWithApi(job, connection.key);
      if (task === 'review') {
        const review = readReview(result);
        outcome = { result: review.good ?? 'Что ещё можно улучшить:', remarks: review.remarks };
      } else {
        // The reply's last line may carry the next steps.
        const reply = splitReply(result);
        outcome = { result: reply.text, next: task ? [] : reply.next };
      }
    } catch (error) {
      const message = (error as Error).message;
      outcome = abort.signal.aborted ? { result: STOPPED } : { error: explain(message) };
      // A session Claude Code no longer knows starts over next time.
      if (/session|сесси/i.test(message)) talks.setSession(file, talk.id, undefined);
    }
    run.current = null;
    setLive(null);
    setRebuilding(false);
    // After work on a detail the selection stays on it, new parts included.
    if (selection.length && ws.current() === file) {
      const after = ws.scene(file)?.objects ?? [];
      const added = after.filter(p => !scene.objects.some(o => o.id === p.id)).map(p => p.id);
      ws.select([...selection.filter(id => after.some(p => p.id === id)), ...added]);
    }
    // Tidying must leave the picture as it was: the same boxes, motion and
    // delays under whatever names. If not, it goes back.
    if (task === 'tidy' && !outcome.error && ws.scene(file) && shape(ws.scene(file)!) !== shape(scene)) {
      ws.show(file, scene, true);
      outcome = { error: { text: 'Claude задел геометрию — вернул сцену как была', fix: 'retry' } };
    }
    const changed = ws.settle(file, scene);
    setJob(j => j && { ...j, running: false, changed, ...outcome });
    talks.record(file, talk.id, { prompt, result: outcome.result, error: outcome.error }, changed);
  };

  // What the picture is made of, names aside: each block at rest and on hover, and its delay.
  const shape = (s: Scene) => s.objects.map(p => [BOX_KEYS.map(k => p[k]), BOX_KEYS.map(k => hoverBox(p)[k]), p.delay || 0].join()).sort().join('|');

  const stop = () => {
    const current = run.current;
    if (!current) return;
    if (onDisk(current.engine)) stopClaudeCode(current.file);
    current.abort.abort();
  };

  // Opening a file Claude Code is still working on shows that run as it goes.
  useEffect(() => {
    if (!ws.loaded || !ws.file || ws.browserOnly || run.current) return;
    agentRuns().then(list => {
      const going = list.find(r => r.file === ws.file);
      // The timer goes on from when the run started, not from the reload.
      if (going && !run.current && ws.current() === going.file) start(going.prompt, { watch: true, at: going.at });
    });
  }, [ws.loaded, ws.file]);

  const leave = (fn: () => void) => { if (ws.file && !run.current) { fn(); setJob(null); } };
  return {
    connection, open, setOpen, job, live, rebuilding, running: !!job?.running,
    talk: talks.talk, talks: talks.talks, thread: talks.thread, hasSession: talks.hasSession,
    generate: (prompt: string, fresh = false) => start(prompt, { fresh }),
    // Only Claude Code does these; they read and write the file on disk.
    canTidy: connection.engine === 'local',
    tidy: () => start('Причесать слои', { task: 'tidy' }),
    review: () => start('Оценить сцену', { task: 'review' }),
    stop,
    dismiss: () => setJob(null),
    newConversation: () => leave(() => talks.fresh(ws.file!)),
    openConversation: (id: string) => leave(() => talks.open(ws.file!, id)),
    deleteConversation: (id: string) => leave(() => talks.remove(ws.file!, id)),
  };
}
export type Claude = ReturnType<typeof useClaude>;

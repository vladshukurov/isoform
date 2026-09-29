// Conversations with Claude, per file: each keeps its exchanges and the
// Claude Code session its follow-ups continue; you can go back to any.
// Kept in this browser across reloads.
import { useRef, useState } from 'react';
import type { Problem } from './errors';

export type Turn = { prompt: string; result?: string; error?: Problem };
export type Talk = { id: string; title: string; session?: string; turns: Turn[]; at: number; named?: boolean };
type FileTalks = { current: string | null; list: Talk[] };

const STORE = 'isoform:talks', LIMIT = 30;
const title = (prompt: string) => prompt.trim().slice(0, 80);
// Turns saved before errors were explained kept them as plain text.
const upgrade = (all: Record<string, FileTalks>) => {
  for (const f of Object.values(all)) for (const t of f.list) for (const turn of t.turns)
    if (typeof turn.error === 'string') turn.error = { text: turn.error, fix: 'retry' };
  return all;
};
const load = (): Record<string, FileTalks> => { try { return upgrade(JSON.parse(localStorage.getItem(STORE) ?? '{}')); } catch { return {}; } };

export function useTalks(file: string | null) {
  const [all, setAll] = useState(load);
  const ref = useRef(all);
  const update = (fn: (all: Record<string, FileTalks>) => Record<string, FileTalks>) => {
    ref.current = fn(ref.current);
    setAll(ref.current);
    try { localStorage.setItem(STORE, JSON.stringify(ref.current)); } catch { /* private mode */ }
  };
  const edit = (file: string, id: string, fn: (t: Talk) => Talk) => update(all => {
    const f = all[file];
    return f ? { ...all, [file]: { ...f, list: f.list.map(t => t.id === id ? fn(t) : t) } } : all;
  });
  const pick = (file: string, id: string | null) => update(all => all[file] ? { ...all, [file]: { ...all[file], current: id } } : all);

  // The open conversation, or a new one named after its first message.
  const begin = (file: string, prompt: string): Talk => {
    const f = ref.current[file];
    const open = f?.list.find(t => t.id === f.current);
    if (open) return open;
    const made: Talk = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, title: title(prompt), turns: [], at: Date.now() };
    update(all => ({ ...all, [file]: { current: made.id, list: [made, ...all[file]?.list ?? []].slice(0, LIMIT) } }));
    return made;
  };
  // A conversation is renamed after its first message that changed the scene.
  const record = (file: string, id: string, turn: Turn, changed: boolean) => edit(file, id, t => ({
    ...t, turns: [...t.turns, turn], at: Date.now(), ...(changed && !t.named ? { title: title(turn.prompt), named: true } : {}),
  }));
  const setSession = (file: string, id: string, session: string | undefined) => edit(file, id, t => ({ ...t, session }));

  const mine = file ? all[file] : undefined;
  const talk = mine?.list.find(t => t.id === mine.current) ?? null;
  return {
    talk, talks: mine?.list ?? [], thread: talk?.turns ?? [], hasSession: !!talk?.session,
    begin, record, setSession,
    // A fresh conversation: the next message starts one; the old ones stay.
    fresh: (file: string) => pick(file, null),
    // A conversation gone for good; the scene keeps everything it did.
    remove: (file: string, id: string) => update(all => {
      const f = all[file];
      if (!f) return all;
      return { ...all, [file]: { current: f.current === id ? null : f.current, list: f.list.filter(t => t.id !== id) } };
    }),
    open: (file: string, id: string) => pick(file, id),
  };
}

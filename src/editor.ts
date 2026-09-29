import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from './api';
import { runWithApi } from './ai/api';
import type { Step } from './ai/job';
import { runWithClaudeCode } from './ai/local';
import * as clipboard from './clipboard';
import * as ops from './ops';
import { bounds } from './snap';
import { formatScene } from './format';
import {
  cleanHover, depthSort, GAP, GROUND, hoverBox, hoverKind, insertByDepth, PLATE, pick, uniqueId, validateScene,
  type Box, type Piece, type Scene,
} from './model';

export type Mode = 'rest' | 'hover';
export type Tool = 'move' | 'hand' | 'block' | 'plate';
// Undo keeps the selection with each step, so ⌘Z puts you back where you were.
type Snapshot = { scene: Scene; selection: string[] };
type History = { past: Snapshot[]; future: Snapshot[] };
export type SaveState = 'saved' | 'saving' | 'error';

const snapshotLimit = 200;
const validName = (name: string) => /^[a-z0-9][a-z0-9-]*$/.test(name);
// Blocks added or changed between two versions of a scene.
const changedIds = (before: Scene, after: Scene) => after.objects
  .filter(p => { const was = before.objects.find(o => o.id === p.id); return !was || JSON.stringify(was) !== JSON.stringify(p); })
  .map(p => p.id);
const blank = (): Scene => ({ version: 2, title: 'Новая иллюстрация', motion: 'mechanical', objects: [] });

// Editing a block in one state: at rest its hover travels with it (the
// offset is what the page animates); in the hover state only hover changes.
// Hover values equal to rest are kept in memory while editing, so dragging
// a size through the hover value doesn't erase the morph; files drop them.
export function patchPiece(piece: Piece, patch: Partial<Box>, mode: Mode): Piece {
  if (mode === 'hover') return { ...piece, hover: { ...piece.hover, ...patch } };
  const hover = piece.hover && Object.fromEntries(Object.entries(piece.hover).map(([k, v]) =>
    [k, (k === 'x' || k === 'y' || k === 'z') && patch[k] !== undefined ? v + patch[k]! - piece[k] : v]));
  return { ...piece, ...patch, ...(hover ? { hover } : {}) };
}

export function useEditor() {
  const [files, setFiles] = useState<Record<string, Scene>>({});
  const [templates, setTemplates] = useState<Record<string, Scene>>({});
  const [loaded, setLoaded] = useState(false);
  const [local, setLocal] = useState(false);
  const [root, setRoot] = useState('');
  const [current, setCurrentState] = useState<string | null>(null);
  const [selection, setSelectionState] = useState<string[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('rest');
  const [tool, setTool] = useState<Tool>('move');
  const [save, setSave] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [message, setMessageState] = useState<string | null>(null);
  // The last change that came from disk (an agent), to flash and offer undo.
  const [external, setExternal] = useState<{ name: string; ids: string[]; at: number; created?: boolean; quiet?: boolean } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  // In-editor generation: its steps, and the file it writes to while running.
  const [job, setJob] = useState<{ file: string; steps: Step[]; running: boolean; result?: string; error?: string } | null>(null);
  const running = useRef<{ file: string; abort: AbortController } | null>(null);
  const stacks = useRef<Record<string, History>>({});
  const lastDuplicate = useRef<{ file: string | null; from: string[]; to: string[] } | null>(null);
  const dirty = useRef(new Set<string>());
  const broken = useRef(new Set<string>());
  // Mirrors so actions, async flows and menus built earlier read the latest values.
  const latest = useRef(files);
  latest.current = files;
  const cur = useRef(current);
  const sel = useRef(selection);
  const setCurrent = (name: string | null) => { cur.current = name; setCurrentState(name); };
  const setSelection = useCallback((ids: string[]) => { sel.current = ids; setSelectionState(ids); }, []);
  const commit = (name: string, next: Scene) => {
    latest.current = { ...latest.current, [name]: next };
    dirty.current.add(name);
    setFiles(latest.current);
  };

  // Messages fade on their own.
  const messageTimer = useRef(0);
  const setMessage = useCallback((text: string | null) => {
    clearTimeout(messageTimer.current);
    setMessageState(text);
    if (text) messageTimer.current = window.setTimeout(() => setMessageState(null), 4500);
  }, []);

  useEffect(() => {
    api.loadLibrary().then(library => {
      const byName = (list: { name: string; scene: Scene }[]) => Object.fromEntries(list.map(s => [s.name, s.scene]));
      latest.current = byName(library.files);
      setFiles(latest.current);
      setTemplates(byName(library.templates));
      setRoot(library.root);
      setLocal(library.local);
      broken.current = new Set(library.broken?.map(b => b.name));
      if (library.broken?.length) setMessage(`Не читается: ${library.broken.map(b => `${b.name}.json — ${b.error}`).join('; ')}`);
      const fromUrl = new URLSearchParams(location.search).get('file');
      setCurrent(library.files.find(s => s.name === fromUrl)?.name ?? library.files[0]?.name ?? null);
      setLoaded(true);
    }).catch(error => setMessage(error.message));
  }, []);

  const track = (name: string) => (stacks.current[name] ??= { past: [], future: [] });

  // Someone else changed a file on disk (an agent, git): take it unless it
  // has unsaved local edits. For an open file the change goes into undo.
  useEffect(() => {
    const onFile = async ({ name, removed }: { name: string; removed: boolean }) => {
      if (dirty.current.has(name)) return;
      if (removed) {
        if (!latest.current[name]) return;
        const { [name]: _, ...rest } = latest.current;
        latest.current = rest;
        delete stacks.current[name];
        setFiles(rest);
        if (cur.current === name) setCurrent(Object.keys(rest)[0] ?? null);
        return;
      }
      try {
        const scene = await api.readFile(name);
        // An edit made while the file was being read wins.
        if (dirty.current.has(name)) return;
        broken.current.delete(name);
        const before = latest.current[name];
        if (before && formatScene(before) === formatScene(scene)) return;
        // A generation writing this file already holds one undo step for the whole run.
        const generating = running.current?.file === name;
        if (before && !generating) {
          const h = track(name);
          h.past = [...h.past.slice(-snapshotLimit), { scene: before, selection: sel.current }];
          h.future = [];
          setExternal({ name, ids: changedIds(before, scene), at: Date.now() });
        }
        if (before && generating) setExternal({ name, ids: changedIds(before, scene), at: Date.now(), quiet: true });
        latest.current = { ...latest.current, [name]: scene };
        setFiles(latest.current);
        // A new file opens by itself only when nothing else is open;
        // otherwise it is offered, so an agent never yanks you away.
        if (!before && !cur.current) { setCurrent(name); setSelection([]); }
        else if (!before) setExternal({ name, ids: [], at: Date.now(), created: true });
        else if (cur.current === name) setSelection(sel.current.filter(id => scene.objects.some(p => p.id === id)));
      } catch (error) {
        broken.current.add(name);
        setMessage(`${name}.json: ${(error as Error).message}`);
      }
    };
    import.meta.hot?.on('isoform:file', onFile);
    return () => import.meta.hot?.off('isoform:file', onFile);
  }, []);

  useEffect(() => {
    if (loaded) history.replaceState(null, '', current ? `?file=${current}` : location.pathname);
    document.title = current ? `${current} — Isoform` : 'Isoform';
  }, [current, loaded]);

  const flush = async (keepalive = false) => {
    const names = [...dirty.current].filter(name => latest.current[name]);
    if (!names.length) return;
    dirty.current.clear();
    try {
      await Promise.all(names.map(name => api.saveFile(name, latest.current[name], keepalive)));
      setSave(dirty.current.size ? 'saving' : 'saved');
      setSaveError(null);
    } catch (error) {
      names.forEach(name => dirty.current.add(name));
      setSave('error');
      setSaveError((error as Error).message);
    }
  };

  // Autosave shortly after the last edit; a failed save retries by itself.
  useEffect(() => {
    if (!dirty.current.size) return;
    setSave(s => s === 'error' ? s : 'saving');
    const timer = setTimeout(flush, save === 'error' ? 3000 : 350);
    return () => clearTimeout(timer);
  }, [files, save]);

  // Leaving with unsaved edits: send them on the way out and ask to stay.
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (!dirty.current.size) return;
      flush(true);
      e.preventDefault();
    };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, []);

  const scene = current ? files[current] : undefined;

  // record = false while dragging: the drag start already saved a checkpoint.
  const change = useCallback((fn: (scene: Scene) => Scene, record = true) => {
    const name = cur.current;
    if (!name || !latest.current[name]) return;
    const before = latest.current[name], after = fn(before);
    if (after === before) return;
    if (record) {
      const h = track(name);
      h.past = [...h.past.slice(-snapshotLimit), { scene: before, selection: sel.current }];
      h.future = [];
      // «Undo the outside change» would now undo this edit instead.
      setExternal(null);
    }
    commit(name, after);
  }, []);

  const checkpoint = useCallback(() => change(s => ({ ...s }), true), [change]);

  const step = (direction: 'undo' | 'redo') => {
    const name = cur.current;
    if (!name) return;
    const h = track(name);
    const from = direction === 'undo' ? h.past : h.future, to = direction === 'undo' ? h.future : h.past;
    const target = from.pop();
    if (!target) return;
    to.push({ scene: latest.current[name], selection: sel.current });
    setExternal(null);
    lastDuplicate.current = null;
    commit(name, target.scene);
    setSelection(target.selection.filter(id => target.scene.objects.some(p => p.id === id)));
  };

  // Locked blocks never move, resize or disappear, whatever asks.
  const updatePieces = useCallback((ids: string[], fn: (box: Box, piece: Piece) => Partial<Box>, record = true) =>
    change(s => ({ ...s, objects: s.objects.map(p => ids.includes(p.id) && !p.locked ? patchPiece(p, fn(mode === 'hover' ? hoverBox(p) : pick(p), p), mode) : p) }), record),
  [change, mode]);

  const updatePiece = (id: string, patch: Partial<Piece>, record = true) =>
    change(s => ({ ...s, objects: s.objects.map(p => p.id === id ? cleanHover({ ...p, ...patch }) : p) }), record);

  const mapPieces = (ids: string[], fn: (p: Piece) => Piece, record = true) =>
    change(s => ({ ...s, objects: s.objects.map(p => ids.includes(p.id) ? fn(p) : p) }), record);

  // Actions take ids so a context menu acts on what it was opened for.
  const toggle = (ids: string[], flag: 'hidden' | 'locked') => change(s => {
    const on = !s.objects.filter(p => ids.includes(p.id)).every(p => p[flag]);
    return { ...s, objects: s.objects.map(p => ids.includes(p.id) ? { ...p, [flag]: on || undefined } : p) };
  });

  const selected = scene?.objects.filter(p => selection.includes(p.id)) ?? [];
  const piecesOf = (ids: string[]) => (latest.current[cur.current ?? ''] ?? blank()).objects.filter(p => ids.includes(p.id));
  const unlocked = (ids: string[]) => piecesOf(ids).filter(p => !p.locked);

  // Without a drawn box a new block lands on top of the selection (one GAP
  // above, like the series' floating layers), or on the ground at the origin.
  const add = (kind: 'block' | 'plate', box?: Box) => {
    const s = cur.current && latest.current[cur.current];
    if (!s) return;
    const base = piecesOf(sel.current).at(-1);
    const size = kind === 'plate' ? { w: base?.w ?? 120, d: base?.d ?? 120, h: PLATE } : { w: 60, d: 60, h: 60 };
    const at = box ?? (base
      ? { x: base.x + (base.w - size.w) / 2, y: base.y + (base.d - size.d) / 2, z: base.z + base.h + GAP, ...size }
      : { x: -size.w / 2, y: -size.d / 2, z: GROUND, ...size });
    const piece: Piece = { id: uniqueId(s, kind === 'plate' ? 'plate' : 'block'), ...at };
    change(s => ({ ...s, objects: insertByDepth(s.objects, piece) }));
    setSelection([piece.id]);
  };

  const pasteInto = (pieces: Piece[], offset?: { x: number; y: number; z: number }) => {
    const s = cur.current && latest.current[cur.current];
    if (!s || !pieces.length) return [];
    const { scene: next, ids } = clipboard.paste(s, pieces, offset);
    change(() => next);
    setSelection(ids);
    return ids;
  };

  // Copies go one GAP to the right of the originals, keeping their hover.
  // Like Figma, if you move a copy and press ⌘D again, the next copy
  // repeats that step: a row in two gestures.
  const duplicate = (ids = sel.current) => {
    const last = lastDuplicate.current, pieces = piecesOf(ids);
    let offset: { x: number; y: number; z: number } | undefined;
    if (last && last.file === cur.current && ids.length === last.to.length && ids.every(id => last.to.includes(id))) {
      const a = shown([last.from[0]]).get(last.from[0]), b = shown([last.to[0]]).get(last.to[0]);
      if (a && b) offset = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    }
    const copies = pasteInto(pieces, offset);
    lastDuplicate.current = { file: cur.current, from: ids, to: copies };
  };

  const remove = (all = sel.current) => {
    const ids = unlocked(all).map(p => p.id);
    if (!ids.length) return;
    change(s => ({ ...s, objects: s.objects.filter(p => !ids.includes(p.id)) }));
    setSelection(sel.current.filter(id => !ids.includes(id)));
  };

  // Clipboard: kept here for this tab, and written to the system clipboard
  // so blocks travel between tabs and to an agent.
  const copied = useRef<Piece[]>([]);
  const copy = (ids = sel.current, system = true) => {
    const pieces = piecesOf(ids);
    if (!pieces.length) return;
    copied.current = structuredClone(pieces);
    if (system) navigator.clipboard?.writeText(clipboard.serialize(pieces)).catch(() => undefined);
  };
  const cut = (ids = sel.current) => { copy(ids); remove(ids); };
  // A ready prompt that points an agent at these blocks in this file.
  const copyForAgent = (ids = sel.current) => {
    const pieces = piecesOf(ids);
    if (!pieces.length || !cur.current) return;
    const text = `В files/${cur.current}.json поправь блоки ${pieces.map(p => p.id).join(', ')}:\n\n`
      + pieces.map(p => JSON.stringify(cleanHover(p))).join('\n')
      + '\n\nЧто сделать: ';
    navigator.clipboard?.writeText(text).then(() => setMessage('Промпт скопирован — вставьте в Claude или Codex и допишите задачу'), () => setMessage('Не удалось скопировать'));
  };
  const paste = async (text?: string) => {
    const pieces = text !== undefined ? clipboard.parse(text) : copied.current;
    if (pieces?.length) pasteInto(pieces);
    else if (text !== undefined) setMessage('В буфере нет блоков Isoform');
  };

  // Painter order: later blocks cover earlier ones.
  const reorder = (delta: number, ids = sel.current) => change(s => {
    const objects = [...s.objects];
    const indexes = objects.map((p, i) => ids.includes(p.id) ? i : -1).filter(i => i >= 0);
    for (const i of delta > 0 ? indexes.reverse() : indexes) {
      const j = i + delta;
      if (j < 0 || j >= objects.length || ids.includes(objects[j].id)) continue;
      [objects[i], objects[j]] = [objects[j], objects[i]];
    }
    return { ...s, objects };
  });
  const toEdge = (front: boolean, ids = sel.current) => change(s => {
    const moving = s.objects.filter(p => ids.includes(p.id)), rest = s.objects.filter(p => !ids.includes(p.id));
    return { ...s, objects: front ? [...rest, ...moving] : [...moving, ...rest] };
  });
  // Moves blocks so they sit just before `before` in painter order (null = frontmost).
  const moveBefore = (ids: string[], before: string | null) => change(s => {
    const moving = s.objects.filter(p => ids.includes(p.id)), rest = s.objects.filter(p => !ids.includes(p.id));
    const at = before === null ? rest.length : rest.findIndex(p => p.id === before);
    return { ...s, objects: [...rest.slice(0, at), ...moving, ...rest.slice(at)] };
  });
  const autoOrder = () => change(s => ({ ...s, objects: depthSort(s.objects) }));
  const clearHover = (ids = sel.current) => mapPieces(ids, ({ hover: _, delay: __, ...p }) => p);

  // Arranging, on the state shown (rest or hover).
  const shown = (ids: string[]) => new Map(piecesOf(ids).map(p => [p.id, mode === 'hover' ? hoverBox(p) : pick(p)]));
  const alignTo = (axis: ops.Axis, edge: ops.Edge, ids = sel.current) => {
    const at = ops.align(shown(ids), axis, edge);
    updatePieces([...at.keys()], (_, p) => ({ [axis]: at.get(p.id)! }));
  };
  const distribute = (axis: ops.Axis, ids = sel.current) => {
    const at = ops.distribute(shown(ids), axis);
    if (at.size) updatePieces([...at.keys()], (_, p) => ({ [axis]: at.get(p.id)! }));
  };
  const replacePieces = (next: Piece[]) => {
    const byId = new Map(next.map(p => [p.id, p]));
    change(s => ({ ...s, objects: s.objects.map(p => byId.get(p.id) ?? p) }));
  };
  const mirror = (axis: 'x' | 'y', ids = sel.current) => { const p = unlocked(ids); if (p.length) replacePieces(ops.mirror(p, axis)); };
  const rotate = (ids = sel.current) => { const p = unlocked(ids); if (p.length) replacePieces(ops.rotate(p)); };
  // A delay wave through the animated blocks (the selection, or all of them).
  const stagger = (step = .04, ids = sel.current) => {
    const s = cur.current && latest.current[cur.current];
    if (!s) return;
    const animated = s.objects.filter(p => hoverKind(p) !== 'rest' && !p.hidden && (!ids.length || ids.includes(p.id)));
    if (!animated.length) return;
    const delays = ops.stagger(animated, step);
    mapPieces([...delays.keys()], p => ({ ...p, delay: delays.get(p.id) || undefined }));
  };

  // Hand assembly: a row of copies in one step, gravity, matching sizes.
  const repeat = (axis: ops.Axis, count: number, gap: number, ids = sel.current) => {
    const s = cur.current && latest.current[cur.current], pieces = piecesOf(ids);
    if (!s || !pieces.length || count < 2) return;
    let next = s;
    const made: string[] = [];
    for (const offset of ops.repeatOffsets(pieces, axis, count, gap)) {
      const pasted = clipboard.paste(next, pieces, offset);
      next = pasted.scene;
      made.push(...pasted.ids);
    }
    change(() => next);
    setSelection([...ids, ...made]);
  };
  const drop = (ids = sel.current) => {
    const s = cur.current && latest.current[cur.current], moving = unlocked(ids);
    if (!s || !moving.length) return;
    const boxes = shown(moving.map(p => p.id)), group = bounds([...boxes.values()]);
    const others = s.objects.filter(p => !p.hidden && !ids.includes(p.id)).map(p => mode === 'hover' ? hoverBox(p) : pick(p));
    const dz = ops.dropHeight(group, others, GROUND) - group.z;
    if (dz) updatePieces(moving.map(p => p.id), b => ({ z: b.z + dz }));
  };
  // Every selected block takes the size of the last one picked.
  const matchSize = (keys: ('w' | 'd' | 'h')[] = ['w', 'd', 'h'], ids = sel.current) => {
    const ref = shown([ids.at(-1)!]).get(ids.at(-1)!);
    if (!ref || ids.length < 2) return;
    updatePieces(ids.slice(0, -1), () => Object.fromEntries(keys.map(k => [k, ref[k]])));
  };

  const rename = (id: string, next: string) => {
    if (!scene || !next || next === id || scene.objects.some(p => p.id === next)) return false;
    change(s => ({ ...s, objects: s.objects.map(p => p.id === id ? { ...p, id: next } : p) }));
    setSelection(sel.current.map(i => i === id ? next : i));
    return true;
  };

  // Files
  const taken = (name: string) => !!latest.current[name] || broken.current.has(name);
  const freeName = (base: string) => {
    if (!taken(base)) return base;
    for (let i = 2; ; i++) if (!taken(`${base}-${i}`)) return `${base}-${i}`;
  };
  const openFile = (name: string | null) => { setCurrent(name); setSelection([]); setMode('rest'); setTool('move'); lastDuplicate.current = null; };
  const addFile = (base: string, scene: Scene) => {
    const name = freeName(base);
    commit(name, scene);
    openFile(name);
    return name;
  };
  const createFile = (template?: string) => addFile(template ?? 'scene', template ? structuredClone(templates[template]) : blank());
  const duplicateFile = () => { if (cur.current) addFile(cur.current.replace(/-\d+$/, ''), structuredClone(latest.current[cur.current])); };
  const importFile = (base: string, text: string) => {
    try {
      addFile(validName(base) ? base : 'imported', validateScene(JSON.parse(text)));
    } catch (error) {
      setMessage(`Не получилось открыть: ${(error as Error).message}`);
    }
  };
  const renameFile = async (next: string) => {
    const from = cur.current;
    if (!from || next === from) return true;
    if (!validName(next)) { setMessage('Имя файла: латиница, цифры и дефис'); return false; }
    if (taken(next)) { setMessage(`Файл ${next} уже есть`); return false; }
    await flush();
    try {
      await api.renameFile(from, next);
    } catch (error) {
      setMessage((error as Error).message);
      return false;
    }
    const { [from]: scene, ...rest } = latest.current;
    latest.current = { ...rest, [next]: scene };
    stacks.current[next] = track(from);
    delete stacks.current[from];
    // Edits made during the rename belong to the new name.
    if (dirty.current.delete(from)) dirty.current.add(next);
    setFiles(latest.current);
    setCurrent(next);
    return true;
  };
  const deleteFile = async () => {
    const name = cur.current;
    if (!name) return;
    try {
      await api.deleteFile(name);
    } catch (error) {
      setMessage((error as Error).message);
      return;
    }
    dirty.current.delete(name);
    delete stacks.current[name];
    const { [name]: _, ...rest } = latest.current;
    latest.current = rest;
    setFiles(rest);
    openFile(Object.keys(rest)[0] ?? null);
  };

  // Generation: one undo step for the whole run; drafts land on the canvas as they come.
  const generate = async (prompt: string, engine: 'local' | 'api', key = '') => {
    if (running.current) return;
    let file = cur.current;
    if (!file) file = addFile('scene', blank());
    const scene = latest.current[file] ?? blank(), selection = sel.current;
    const abort = new AbortController();
    running.current = { file, abort };
    change(s => ({ ...s }), true);
    // Local runs write through disk; flush first so the agent reads what you see.
    if (engine === 'local') await flush();
    setJob({ file, steps: [], running: true });
    const progress = (step: Step) => setJob(j => j && { ...j, steps: [...j.steps.filter(s => s.kind !== step.kind || step.kind === 'tool').slice(-6), step] });
    const draft = (next: Scene) => {
      if (cur.current !== file) return;
      latest.current = { ...latest.current, [file!]: next };
      dirty.current.add(file!);
      setFiles(latest.current);
    };
    try {
      const job = { prompt, file, scene, selection, signal: abort.signal, progress, draft };
      const result = engine === 'local' ? await runWithClaudeCode(job) : await runWithApi(job, key);
      setJob(j => j && { ...j, running: false, result });
    } catch (error) {
      const aborted = abort.signal.aborted;
      setJob(j => j && { ...j, running: false, error: aborted ? undefined : (error as Error).message, result: aborted ? 'Остановлено' : undefined });
    } finally {
      running.current = null;
      // A run that changed nothing leaves no empty undo step behind.
      const h = track(file);
      if (h.past.length && formatScene(h.past.at(-1)!.scene) === formatScene(latest.current[file] ?? blank())) h.past.pop();
    }
  };
  const stopGenerating = () => running.current?.abort.abort();

  return {
    job, generate, stopGenerating, dismissJob: () => setJob(null), aiOpen, setAiOpen,
    files, templates, loaded, local, root, current, scene, selection, selected, hovered, mode, tool, save, saveError, message,
    external, dismissExternal: () => setExternal(null), renaming, setRenaming,
    alignTo, distribute, mirror, rotate, stagger, repeat, drop, matchSize,
    setSelection, setHovered, setMode, setTool, setMessage, change, checkpoint, updatePieces, updatePiece, mapPieces, toggle,
    add, duplicate, remove, copy, cut, copyForAgent, paste, reorder, toEdge, moveBefore, autoOrder, clearHover, rename,
    openFile, createFile, duplicateFile, importFile, renameFile, deleteFile,
    undo: () => step('undo'), redo: () => step('redo'),
  };
}
export type Editor = ReturnType<typeof useEditor>;

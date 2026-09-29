import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from './api';
import { formatScene } from './format';
import {
  cleanHover, depthSort, GAP, GROUND, hoverBox, insertByDepth, PLATE, pick, uniqueId,
  type Box, type Piece, type Scene,
} from './model';

export type Mode = 'rest' | 'hover';
export type Tool = 'move' | 'hand' | 'block' | 'plate';
type History = { past: Scene[]; future: Scene[] };
export type SaveState = 'saved' | 'saving' | 'error';

const snapshotLimit = 200;
const blank = (): Scene => ({ version: 2, title: 'Новая иллюстрация', motion: 'mechanical', objects: [] });

// Editing a block in one state: at rest its hover travels with it (the
// offset is what the page animates); in the hover state only hover changes.
function patchPiece(piece: Piece, patch: Partial<Box>, mode: Mode): Piece {
  if (mode === 'hover') return cleanHover({ ...piece, hover: { ...piece.hover, ...patch } });
  const hover = piece.hover && Object.fromEntries(Object.entries(piece.hover).map(([k, v]) =>
    [k, (k === 'x' || k === 'y' || k === 'z') && patch[k] !== undefined ? v + patch[k]! - piece[k] : v]));
  return cleanHover({ ...piece, ...patch, hover });
}

export function useEditor() {
  const [files, setFiles] = useState<Record<string, Scene>>({});
  const [templates, setTemplates] = useState<Record<string, Scene>>({});
  const [loaded, setLoaded] = useState(false);
  const [root, setRoot] = useState('');
  const [current, setCurrent] = useState<string | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('rest');
  const [tool, setTool] = useState<Tool>('move');
  const [save, setSave] = useState<SaveState>('saved');
  const [message, setMessage] = useState<string | null>(null);
  const stacks = useRef<Record<string, History>>({});
  const dirty = useRef(new Set<string>());
  // Mirror of files so edits and undo read the latest value synchronously.
  const latest = useRef(files);
  latest.current = files;
  const commit = (name: string, next: Scene) => {
    latest.current = { ...latest.current, [name]: next };
    dirty.current.add(name);
    setFiles(latest.current);
  };

  useEffect(() => {
    api.loadLibrary().then(library => {
      const byName = (list: { name: string; scene: Scene }[]) => Object.fromEntries(list.map(s => [s.name, s.scene]));
      setFiles(byName(library.files));
      setTemplates(byName(library.templates));
      setRoot(library.root);
      const fromUrl = new URLSearchParams(location.search).get('file');
      setCurrent(library.files.find(s => s.name === fromUrl)?.name ?? library.files[0]?.name ?? null);
      setLoaded(true);
    }).catch(error => setMessage(error.message));
  }, []);

  // Someone else changed a file on disk: take it, unless it has unsaved
  // local edits. For the open file the change goes into undo history.
  useEffect(() => {
    const onFile = async ({ name, removed }: { name: string; removed: boolean }) => {
      if (dirty.current.has(name)) return;
      if (removed) {
        if (!latest.current[name]) return;
        const { [name]: _, ...rest } = latest.current;
        latest.current = rest;
        setFiles(rest);
        setCurrent(c => c === name ? Object.keys(rest)[0] ?? null : c);
        return;
      }
      try {
        const scene = await api.readFile(name);
        const before = latest.current[name];
        if (before && formatScene(before) === formatScene(scene)) return;
        if (before) {
          const h = track(name);
          h.past = [...h.past.slice(-snapshotLimit), before];
          h.future = [];
        }
        latest.current = { ...latest.current, [name]: scene };
        setFiles(latest.current);
        if (!before) { setCurrent(name); setSelection([]); }
        setSelection(ids => ids.filter(id => scene.objects.some(p => p.id === id)));
      } catch (error) {
        setMessage(`${name}.json: ${(error as Error).message}`);
      }
    };
    import.meta.hot?.on('isoform:file', onFile);
    return () => import.meta.hot?.off('isoform:file', onFile);
  }, []);

  useEffect(() => {
    if (loaded) history.replaceState(null, '', current ? `?file=${current}` : location.pathname);
  }, [current, loaded]);

  const flush = async () => {
    const names = [...dirty.current].filter(name => latest.current[name]);
    dirty.current.clear();
    try {
      await Promise.all(names.map(name => api.saveFile(name, latest.current[name])));
      setSave('saved');
    } catch (error) {
      names.forEach(name => dirty.current.add(name));
      setSave('error');
      setMessage((error as Error).message);
    }
  };

  // Autosave shortly after the last edit.
  useEffect(() => {
    if (!dirty.current.size) return;
    setSave('saving');
    const timer = setTimeout(flush, 350);
    return () => clearTimeout(timer);
  }, [files]);

  const scene = current ? files[current] : undefined;
  const track = (name: string) => (stacks.current[name] ??= { past: [], future: [] });

  // record = false while dragging: the drag start already saved a checkpoint.
  const change = useCallback((fn: (scene: Scene) => Scene, record = true) => {
    if (!current) return;
    const before = latest.current[current], after = fn(before);
    if (after === before) return;
    if (record) {
      const h = track(current);
      h.past = [...h.past.slice(-snapshotLimit), before];
      h.future = [];
    }
    commit(current, after);
  }, [current]);

  const checkpoint = useCallback(() => change(s => ({ ...s }), true), [change]);

  const step = (direction: 'undo' | 'redo') => {
    if (!current) return;
    const h = track(current);
    const from = direction === 'undo' ? h.past : h.future, to = direction === 'undo' ? h.future : h.past;
    const target = from.pop();
    if (!target) return;
    to.push(latest.current[current]);
    commit(current, target);
    setSelection(ids => ids.filter(id => target.objects.some(p => p.id === id)));
  };

  const updatePieces = useCallback((ids: string[], fn: (box: Box, piece: Piece) => Partial<Box>, record = true) =>
    change(s => ({ ...s, objects: s.objects.map(p => ids.includes(p.id) ? patchPiece(p, fn(mode === 'hover' ? hoverBox(p) : pick(p), p), mode) : p) }), record),
  [change, mode]);

  const updatePiece = (id: string, patch: Partial<Piece>) =>
    change(s => ({ ...s, objects: s.objects.map(p => p.id === id ? cleanHover({ ...p, ...patch }) : p) }));

  const toggle = (ids: string[], flag: 'hidden' | 'locked') => change(s => {
    const on = !s.objects.filter(p => ids.includes(p.id)).every(p => p[flag]);
    return { ...s, objects: s.objects.map(p => ids.includes(p.id) ? { ...p, [flag]: on || undefined } : p) };
  });

  const selected = scene?.objects.filter(p => selection.includes(p.id)) ?? [];

  // Without a drawn box a new block lands on top of the selection (one GAP
  // above, like the series' floating layers), or on the ground at the origin.
  const add = (kind: 'block' | 'plate', box?: Box) => {
    if (!scene) return;
    const base = selected.at(-1);
    const size = kind === 'plate' ? { w: base?.w ?? 120, d: base?.d ?? 120, h: PLATE } : { w: 60, d: 60, h: 60 };
    const at = box ?? (base
      ? { x: base.x + (base.w - size.w) / 2, y: base.y + (base.d - size.d) / 2, z: base.z + base.h + GAP, ...size }
      : { x: -size.w / 2, y: -size.d / 2, z: GROUND, ...size });
    const piece: Piece = { id: uniqueId(scene, kind === 'plate' ? 'plate' : 'block'), ...at };
    change(s => ({ ...s, objects: insertByDepth(s.objects, piece) }));
    setSelection([piece.id]);
  };

  // Copies go one GAP to the right of the originals, keeping their hover.
  const duplicate = () => {
    if (!scene || !selected.length) return;
    const minX = Math.min(...selected.map(p => p.x)), maxX = Math.max(...selected.map(p => p.x + p.w));
    const shift = maxX - minX + GAP;
    let next = scene;
    const ids: string[] = [];
    for (const p of selected) {
      const id = uniqueId(next, p.id);
      const hover = p.hover && { ...p.hover, ...(p.hover.x !== undefined ? { x: p.hover.x + shift } : {}) };
      next = { ...next, objects: [...next.objects, cleanHover({ ...p, id, x: p.x + shift, hover })] };
      ids.push(id);
    }
    change(() => next);
    setSelection(ids);
  };

  const remove = () => {
    if (!selection.length) return;
    change(s => ({ ...s, objects: s.objects.filter(p => !selection.includes(p.id)) }));
    setSelection([]);
  };

  // Painter order: later blocks cover earlier ones.
  const reorder = (delta: number) => change(s => {
    const objects = [...s.objects];
    const indexes = objects.map((p, i) => selection.includes(p.id) ? i : -1).filter(i => i >= 0);
    for (const i of delta > 0 ? indexes.reverse() : indexes) {
      const j = i + delta;
      if (j < 0 || j >= objects.length || selection.includes(objects[j].id)) continue;
      [objects[i], objects[j]] = [objects[j], objects[i]];
    }
    return { ...s, objects };
  });
  const toEdge = (front: boolean) => change(s => {
    const moving = s.objects.filter(p => selection.includes(p.id)), rest = s.objects.filter(p => !selection.includes(p.id));
    return { ...s, objects: front ? [...rest, ...moving] : [...moving, ...rest] };
  });
  // Moves blocks so they sit just before `before` in painter order (null = frontmost).
  const moveBefore = (ids: string[], before: string | null) => change(s => {
    const moving = s.objects.filter(p => ids.includes(p.id)), rest = s.objects.filter(p => !ids.includes(p.id));
    const at = before === null ? rest.length : rest.findIndex(p => p.id === before);
    return { ...s, objects: [...rest.slice(0, at), ...moving, ...rest.slice(at)] };
  });
  const autoOrder = () => change(s => ({ ...s, objects: depthSort(s.objects) }));

  const rename = (id: string, next: string) => {
    if (!scene || !next || next === id || scene.objects.some(p => p.id === next)) return false;
    change(s => ({ ...s, objects: s.objects.map(p => p.id === id ? { ...p, id: next } : p) }));
    setSelection(ids => ids.map(i => i === id ? next : i));
    return true;
  };

  // Files
  const freeName = (base: string) => {
    if (!latest.current[base]) return base;
    for (let i = 2; ; i++) if (!latest.current[`${base}-${i}`]) return `${base}-${i}`;
  };
  const openFile = (name: string | null) => { setCurrent(name); setSelection([]); setMode('rest'); setTool('move'); };
  const createFile = (template?: string) => {
    const name = freeName(template ?? 'scene');
    commit(name, template ? structuredClone(templates[template]) : blank());
    openFile(name);
  };
  const duplicateFile = () => {
    if (!current) return;
    const name = freeName(current.replace(/-\d+$/, ''));
    commit(name, structuredClone(latest.current[current]));
    openFile(name);
  };
  const renameFile = async (next: string) => {
    if (!current || next === current) return true;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(next)) { setMessage('Имя файла: латиница, цифры и дефис'); return false; }
    if (latest.current[next]) { setMessage(`Файл ${next} уже есть`); return false; }
    await flush();
    try {
      await api.renameFile(current, next);
    } catch (error) {
      setMessage((error as Error).message);
      return false;
    }
    const { [current]: scene, ...rest } = latest.current;
    latest.current = { ...rest, [next]: scene };
    stacks.current[next] = track(current);
    setFiles(latest.current);
    setCurrent(next);
    return true;
  };
  const deleteFile = async () => {
    if (!current) return;
    dirty.current.delete(current);
    await api.deleteFile(current).catch(() => undefined);
    const { [current]: _, ...rest } = latest.current;
    latest.current = rest;
    setFiles(rest);
    openFile(Object.keys(rest)[0] ?? null);
  };

  return {
    files, templates, loaded, root, current, scene, selection, selected, hovered, mode, tool, save, message,
    setSelection, setHovered, setMode, setTool, setMessage, change, checkpoint, updatePieces, updatePiece, toggle,
    add, duplicate, remove, reorder, toEdge, moveBefore, autoOrder, rename,
    openFile, createFile, duplicateFile, renameFile, deleteFile,
    undo: () => step('undo'), redo: () => step('redo'),
  };
}
export type Editor = ReturnType<typeof useEditor>;

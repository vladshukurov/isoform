import { useCallback, useEffect, useRef, useState } from 'react';
import { exportToSite, loadScenes, saveScene } from './api';
import {
  cleanHover, depthSort, GAP, GROUND, hoverBox, insertByDepth, PLATE, pick, uniqueId,
  type Box, type Piece, type Scene,
} from './model';

export type Mode = 'rest' | 'hover';
type History = { past: Scene[]; future: Scene[] };
export type SaveState = 'saved' | 'saving' | 'error';

const snapshotLimit = 200;

// Editing a block in one state: at rest its hover travels with it (the
// offset is what the page animates); in the hover state only hover changes.
function patchPiece(piece: Piece, patch: Partial<Box>, mode: Mode): Piece {
  if (mode === 'hover') return cleanHover({ ...piece, hover: { ...piece.hover, ...patch } });
  const hover = piece.hover && Object.fromEntries(Object.entries(piece.hover).map(([k, v]) =>
    [k, (k === 'x' || k === 'y' || k === 'z') && patch[k] !== undefined ? v + patch[k]! - piece[k] : v]));
  return cleanHover({ ...piece, ...patch, hover });
}

export function useEditor() {
  const [scenes, setScenes] = useState<Record<string, Scene>>({});
  const [current, setCurrent] = useState<string | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>('rest');
  const [save, setSave] = useState<SaveState>('saved');
  const [message, setMessage] = useState<string | null>(null);
  const [siteArtDir, setSiteArtDir] = useState('');
  const stacks = useRef<Record<string, History>>({});
  // Mirror of scenes so edits and undo read the latest value synchronously.
  const latest = useRef(scenes);
  latest.current = scenes;
  const commit = (name: string, next: Scene) => {
    latest.current = { ...latest.current, [name]: next };
    dirty.current.add(name);
    setScenes(latest.current);
  };
  const dirty = useRef(new Set<string>());

  useEffect(() => {
    loadScenes().then(({ scenes: list, siteArtDir }) => {
      setScenes(Object.fromEntries(list.map(s => [s.name, s.scene])));
      setSiteArtDir(siteArtDir);
      const fromUrl = new URLSearchParams(location.search).get('scene');
      setCurrent(list.find(s => s.name === fromUrl)?.name ?? list[0]?.name ?? null);
    }).catch(error => setMessage(error.message));
  }, []);

  useEffect(() => {
    if (current) history.replaceState(null, '', `?scene=${current}`);
  }, [current]);

  // Autosave every changed scene shortly after the last edit.
  useEffect(() => {
    if (!dirty.current.size) return;
    setSave('saving');
    const timer = setTimeout(async () => {
      const names = [...dirty.current];
      dirty.current.clear();
      try {
        await Promise.all(names.map(name => saveScene(name, scenes[name])));
        setSave('saved');
      } catch (error) {
        names.forEach(name => dirty.current.add(name));
        setSave('error');
        setMessage((error as Error).message);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [scenes]);

  const scene = current ? scenes[current] : undefined;
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

  const updatePiece = (id: string, patch: Partial<Piece>) => change(s => ({ ...s, objects: s.objects.map(p => p.id === id ? cleanHover({ ...p, ...patch }) : p) }));

  const selected = scene?.objects.filter(p => selection.includes(p.id)) ?? [];

  // A new block lands on top of the selection (one GAP above, like the
  // series' floating layers), or on the ground at the origin.
  const add = (kind: 'block' | 'plate') => {
    if (!scene) return;
    const base = selected.at(-1);
    const size = kind === 'plate' ? { w: base?.w ?? 120, d: base?.d ?? 120, h: PLATE } : { w: 60, d: 60, h: 60 };
    const at = base
      ? { x: base.x + (base.w - size.w) / 2, y: base.y + (base.d - size.d) / 2, z: base.z + base.h + GAP }
      : { x: -size.w / 2, y: -size.d / 2, z: GROUND };
    const piece: Piece = { id: uniqueId(scene, kind === 'plate' ? 'plate' : 'block'), ...at, ...size };
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
  const moveTo = (id: string, index: number) => change(s => {
    const objects = s.objects.filter(p => p.id !== id);
    objects.splice(index, 0, s.objects.find(p => p.id === id)!);
    return { ...s, objects };
  });
  const autoOrder = () => change(s => ({ ...s, objects: depthSort(s.objects) }));

  const rename = (id: string, next: string) => {
    if (!scene || !next || next === id || scene.objects.some(p => p.id === next)) return false;
    change(s => ({ ...s, objects: s.objects.map(p => p.id === id ? { ...p, id: next } : p) }));
    setSelection(ids => ids.map(i => i === id ? next : i));
    return true;
  };

  const createScene = (name: string, from?: Scene) => {
    const scene: Scene = from ? structuredClone(from) : { version: 2, title: 'Новая иллюстрация', motion: 'mechanical', objects: [] };
    commit(name, scene);
    setCurrent(name);
    setSelection([]);
  };

  const publish = async () => {
    if (!current) return;
    try {
      await saveScene(current, scenes[current]);
      const { files } = await exportToSite(current);
      setMessage(`Выгружено: ${files.map(f => f.split('/').pop()).join(', ')}`);
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  return {
    scenes, current, scene, selection, selected, mode, save, message, siteArtDir,
    open: (name: string) => { setCurrent(name); setSelection([]); },
    setSelection, setMode, setMessage, change, checkpoint, updatePieces, updatePiece,
    add, duplicate, remove, reorder, moveTo, autoOrder, rename, createScene, publish,
    undo: () => step('undo'), redo: () => step('redo'),
  };
}
export type Editor = ReturnType<typeof useEditor>;

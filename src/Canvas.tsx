import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import { Art } from './Art';
import type { Editor } from './editor';
import { AXIS, outline, project, unprojectFloor, vertices, type Vec2 } from './geometry';
import { GROUND, hoverBox, hoverKind, pick, SNAP, type Box } from './model';

type View = { s: number; ox: number; oy: number };
type Drag =
  | { kind: 'move'; x: number; y: number; vertical: boolean; start: Map<string, Box>; moved: boolean }
  | { kind: 'size'; x: number; y: number; key: 'w' | 'd' | 'h'; id: string; start: Box }
  | { kind: 'pan'; x: number; y: number; view: View; moved: boolean };

const snap = (v: number, step: number) => Math.round(v / step) * step;
const HANDLES = [
  { key: 'w', axis: 'x', label: 'Ш', at: (b: Box) => ({ x: b.x + b.w, y: b.y + b.d / 2, z: b.z + b.h / 2 }) },
  { key: 'd', axis: 'y', label: 'Г', at: (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.d, z: b.z + b.h / 2 }) },
  { key: 'h', axis: 'z', label: 'В', at: (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.d / 2, z: b.z + b.h }) },
] as const;

// The working view: the scene in rest or hover state at a free zoom, a floor
// grid on the implied ground, and direct manipulation of the blocks.
export function Canvas({ editor }: { editor: Editor }) {
  const { scene, selection, mode } = editor;
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View | null>(null);
  const drag = useRef<Drag | null>(null);

  useLayoutEffect(() => {
    const el = host.current!;
    const observer = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const objects = scene?.objects ?? [];
  const boxes = useMemo(() => objects.map(p => mode === 'hover' ? hoverBox(p) : pick(p)), [objects, mode]);
  const selected = new Set(selection);

  const fitView = () => {
    const all = objects.flatMap(p => [pick(p), hoverBox(p)]);
    const points = all.length ? all.flatMap(b => vertices(b).map(project)) : [{ x: -260, y: -260 }, { x: 260, y: 200 }];
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    const s = Math.min((size.w - 160) / Math.max(w, 1), (size.h - 160) / Math.max(h, 1), 2.5);
    setView({ s, ox: size.w / 2 - s * (Math.min(...xs) + w / 2), oy: size.h / 2 - s * (Math.min(...ys) + h / 2) });
  };
  // Refit when another scene opens or the window size first becomes known.
  useEffect(() => { if (size.w > 0) fitView(); }, [editor.current, size.w > 0]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'f' && !(e.target as HTMLElement).closest('input, textarea, select')) fitView(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!scene || !view) return <div className="canvas" ref={host} />;
  const toScreen = (p: Vec2) => ({ x: view.ox + p.x * view.s, y: view.oy + p.y * view.s });

  const pieceDown = (id: string, e: PointerEvent) => {
    e.stopPropagation();
    let ids = selection;
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      ids = selected.has(id) ? selection.filter(i => i !== id) : [...selection, id];
      editor.setSelection(ids);
      if (!ids.includes(id)) return;
    } else if (!selected.has(id)) {
      ids = [id];
      editor.setSelection(ids);
    }
    const start = new Map(objects.filter(p => ids.includes(p.id)).map(p => [p.id, mode === 'hover' ? hoverBox(p) : pick(p)]));
    drag.current = { kind: 'move', x: e.clientX, y: e.clientY, vertical: e.altKey, start, moved: false };
    host.current!.setPointerCapture(e.pointerId);
  };

  const handleDown = (key: 'w' | 'd' | 'h', e: PointerEvent) => {
    e.stopPropagation();
    const piece = objects.find(p => p.id === selection[0])!;
    editor.checkpoint();
    drag.current = { kind: 'size', x: e.clientX, y: e.clientY, key, id: piece.id, start: mode === 'hover' ? hoverBox(piece) : pick(piece) };
    host.current!.setPointerCapture(e.pointerId);
  };

  const backgroundDown = (e: PointerEvent) => {
    drag.current = { kind: 'pan', x: e.clientX, y: e.clientY, view, moved: false };
    host.current!.setPointerCapture(e.pointerId);
  };

  const pointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (d.kind === 'pan') {
      if (Math.hypot(dx, dy) > 3) d.moved = true;
      setView({ ...d.view, ox: d.view.ox + dx, oy: d.view.oy + dy });
      return;
    }
    const step = e.shiftKey ? 10 : SNAP;
    if (d.kind === 'move') {
      if (!d.moved && Math.hypot(dx, dy) < 3) return;
      if (!d.moved) { d.moved = true; editor.checkpoint(); }
      const floor = unprojectFloor(dx / view.s, dy / view.s);
      const off = d.vertical || e.altKey ? { x: 0, y: 0, z: snap(-dy / view.s, step) } : { x: snap(floor.x, step), y: snap(floor.y, step), z: 0 };
      editor.updatePieces([...d.start.keys()], (_, p) => {
        const b = d.start.get(p.id)!;
        return { x: b.x + off.x, y: b.y + off.y, z: b.z + off.z };
      }, false);
    }
    if (d.kind === 'size') {
      const axis = AXIS[HANDLES.find(h => h.key === d.key)!.axis];
      const along = (dx * axis.x + dy * axis.y) / view.s;
      editor.updatePieces([d.id], () => ({ [d.key]: Math.max(SNAP, snap(d.start[d.key] + along, step)) }), false);
    }
  };

  const pointerUp = () => {
    const d = drag.current;
    if (d?.kind === 'pan' && !d.moved) editor.setSelection([]);
    drag.current = null;
  };

  const wheel = (e: WheelEvent) => {
    const rect = host.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const s = Math.min(8, Math.max(.2, view.s * Math.exp(-e.deltaY * .0015)));
    setView({ s, ox: mx - (mx - view.ox) * s / view.s, oy: my - (my - view.oy) * s / view.s });
  };

  // Floor grid on the implied ground, 10 units per cell.
  const grid: string[] = [];
  for (let i = -300; i <= 300; i += 10) {
    const line = (a: { x: number; y: number }, b: { x: number; y: number }) => {
      const p = project({ ...a, z: GROUND }), q = project({ ...b, z: GROUND });
      return `M ${p.x} ${p.y} L ${q.x} ${q.y}`;
    };
    grid.push(line({ x: i, y: -300 }, { x: i, y: 300 }), line({ x: -300, y: i }, { x: 300, y: i }));
  }

  const single = selection.length === 1 ? objects.find(p => p.id === selection[0]) : undefined;
  const singleBox = single && (mode === 'hover' ? hoverBox(single) : pick(single));

  return (
    <div className="canvas" ref={host} onPointerDown={backgroundDown} onPointerMove={pointerMove}
      onPointerUp={pointerUp} onPointerCancel={pointerUp} onWheel={wheel}>
      <svg width={size.w} height={size.h} className={`iso-art workspace${mode === 'hover' ? ' is-active' : ''}`}>
        <g transform={`translate(${view.ox} ${view.oy}) scale(${view.s})`}>
          <path className="grid" d={grid.join(' ')} />
          {objects.filter(p => selected.has(p.id)).map(p => {
            const b = mode === 'hover' ? hoverBox(p) : pick(p);
            const foot = [0, 1, 2, 3].map(i => project({ ...vertices(b)[i], z: GROUND }));
            const drops = b.z > GROUND ? [0, 1, 2, 3].map(i => {
              const top = project(vertices(b)[i]);
              return `M ${foot[i].x} ${foot[i].y} L ${top.x} ${top.y}`;
            }).join(' ') : '';
            return <path key={p.id} className="footprint" d={`M ${foot.map(q => `${q.x} ${q.y}`).join(' L ')} Z ${drops}`} />;
          })}
          <Art ids={objects.map(p => p.id)} boxes={boxes} selected={selected} onPiecePointerDown={pieceDown} />
          {/* The other state of selected blocks, so the hover offset stays visible. */}
          {objects.filter(p => selected.has(p.id) && hoverKind(p) !== 'rest').map(p =>
            <path key={p.id} className="ghost" d={outline(mode === 'hover' ? pick(p) : hoverBox(p))} />)}
        </g>
        {singleBox && HANDLES.map(h => {
          const p = toScreen(project(h.at(singleBox)));
          return (
            <g key={h.key} className="handle" transform={`translate(${p.x} ${p.y})`} onPointerDown={e => handleDown(h.key, e)}>
              <circle r="9" />
              <text dy="3.5">{h.label}</text>
            </g>
          );
        })}
      </svg>
      <div className="canvas-hint">
        {mode === 'hover' ? 'Наведение: двигайте и меняйте блоки так, как они должны встать при наведении' : 'Покой'}
        {' · '}тащить — по полу, Alt — по высоте, Shift — шаг 10 · F — вписать
      </div>
    </div>
  );
}

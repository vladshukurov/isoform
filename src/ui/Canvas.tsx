import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Art } from '../Art';
import type { Editor } from '../editor';
import { AXIS, outline, project, unprojectFloor, vertices, type Vec2 } from '../geometry';
import { GAP, GROUND, hoverBox, hoverKind, pick, PLATE, SNAP, type Box } from '../model';
import { bounds, snapMove, snapPoint, snapSize, type Guide } from '../snap';
import { pieceMenu } from './actions';
import { Menu, type MenuItem } from './Menu';

type View = { s: number; ox: number; oy: number };
type Drag =
  | { kind: 'move'; x: number; y: number; vertical: boolean; start: Map<string, Box>; moved: boolean }
  | { kind: 'size'; x: number; y: number; key: 'w' | 'd' | 'h'; id: string; start: Box; moved: boolean }
  | { kind: 'pan'; x: number; y: number; view: View }
  | { kind: 'marquee'; x: number; y: number; to: Vec2; base: string[] }
  | { kind: 'draw'; from: { x: number; y: number }; to: { x: number; y: number }; z: number; plate: boolean };

const snap = (v: number, step: number) => Math.round(v / step) * step;
const HANDLES = [
  { key: 'w', axis: 'x', at: (b: Box) => ({ x: b.x + b.w, y: b.y + b.d / 2, z: b.z + b.h / 2 }) },
  { key: 'd', axis: 'y', at: (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.d, z: b.z + b.h / 2 }) },
  { key: 'h', axis: 'z', at: (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.d / 2, z: b.z + b.h }) },
] as const;
const fmt = (v: number) => String(+v.toFixed(2));
// Smart guides pull within this many screen pixels; hold ⌘ to place freely.
const PULL = 6;
const dialogOpen = () => !!document.querySelector('.backdrop');

// The working view: the scene in rest or hover state on a floor grid, with
// Figma-style navigation (scroll pans, ⌘/pinch zooms, Space drags) and
// direct manipulation of the blocks.
export function Canvas({ editor }: { editor: Editor }) {
  const { scene, selection, mode, tool, hovered } = editor;
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [space, setSpace] = useState(false);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const update = (d: Drag | null) => { dragRef.current = d; setDrag(d); };

  useLayoutEffect(() => {
    const el = host.current!;
    const observer = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const objects = useMemo(() => (scene?.objects ?? []).filter(p => !p.hidden), [scene]);
  const boxOf = (p: typeof objects[number]) => mode === 'hover' ? hoverBox(p) : pick(p);
  const boxes = useMemo(() => objects.map(boxOf), [objects, mode]);
  const locked = useMemo(() => new Set(objects.filter(p => p.locked).map(p => p.id)), [objects]);
  const selected = objects.filter(p => selection.includes(p.id));

  const fitView = () => {
    const all = objects.flatMap(p => [pick(p), hoverBox(p)]);
    const points = all.length ? all.flatMap(b => vertices(b).map(project)) : [{ x: -260, y: -260 }, { x: 260, y: 200 }];
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    const s = Math.min((size.w - 160) / Math.max(w, 1), (size.h - 200) / Math.max(h, 1), 2.5);
    setView({ s, ox: size.w / 2 - s * (Math.min(...xs) + w / 2), oy: size.h / 2 - 20 - s * (Math.min(...ys) + h / 2) });
  };
  const zoomAt = (factor: number, mx = size.w / 2, my = size.h / 2) => setView(v => {
    if (!v) return v;
    const s = Math.min(16, Math.max(.1, v.s * factor));
    return { s, ox: mx - (mx - v.ox) * s / v.s, oy: my - (my - v.oy) * s / v.s };
  });
  useEffect(() => { if (size.w > 0) fitView(); }, [editor.current, size.w > 0]);

  // Scroll pans, ⌘/Ctrl scroll and trackpad pinch zoom around the cursor.
  useEffect(() => {
    const el = host.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        zoomAt(Math.exp(-e.deltaY * .01), e.clientX - r.left, e.clientY - r.top);
      } else setView(v => v && { ...v, ox: v.ox - e.deltaX, oy: v.oy - e.deltaY });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [size]);

  useEffect(() => {
    const typing = (e: KeyboardEvent) => !!(e.target as HTMLElement).closest('input, textarea, select');
    const down = (e: KeyboardEvent) => {
      if (typing(e) || dialogOpen()) return;
      if (e.code === 'Space') { e.preventDefault(); setSpace(true); }
      if (e.shiftKey && e.code === 'Digit1') fitView();
      if (e.shiftKey && e.code === 'Digit0') setView(v => v && { ...v, s: 1 });
      if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomAt(1.25); }
      if ((e.metaKey || e.ctrlKey) && e.key === '-') { e.preventDefault(); zoomAt(.8); }
    };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') setSpace(false); };
    // Released outside the window (⌘-Tab while holding Space).
    const blur = () => setSpace(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  });

  if (!scene || !view) return <div className="canvas" ref={host} />;

  const toScreen = (p: Vec2) => ({ x: view.ox + p.x * view.s, y: view.oy + p.y * view.s });
  const local = (e: { clientX: number; clientY: number }) => {
    const r = host.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  // The scene point under the cursor on the horizontal plane at height z.
  const onPlane = (e: { clientX: number; clientY: number }, z: number) => {
    const p = local(e);
    return unprojectFloor((p.x - view.ox) / view.s, (p.y - view.oy) / view.s + z);
  };
  const panning = tool === 'hand' || space;
  const capture = (e: PointerEvent) => host.current!.setPointerCapture(e.pointerId);

  const threshold = PULL / view.s;
  const othersThan = (ids: Set<string>) => objects.filter(p => !ids.has(p.id)).map(boxOf);
  // A floor point on the 10-unit grid, pulled to other blocks' lines.
  const drawPoint = (e: PointerEvent | { clientX: number; clientY: number; metaKey: boolean }, z: number) => {
    const at = onPlane(e, z), grid = { x: snap(at.x, 10), y: snap(at.y, 10) };
    if (e.metaKey) return { point: grid, guides: [] };
    const pulled = snapPoint(at, z, othersThan(new Set()), threshold);
    return { point: { x: pulled.guides.some(g => g.from.x === g.to.x) ? pulled.point.x : grid.x, y: pulled.guides.some(g => g.from.y === g.to.y) ? pulled.point.y : grid.y }, guides: pulled.guides };
  };

  const startDraw = (e: PointerEvent, z: number) => {
    const { point } = drawPoint(e, z);
    update({ kind: 'draw', from: point, to: point, z, plate: tool === 'plate' });
    capture(e);
  };

  const pieceDown = (id: string, e: PointerEvent) => {
    if (e.button !== 0 || panning) return;
    e.stopPropagation();
    const piece = objects.find(p => p.id === id)!;
    // Drawing on a block's top face stacks the new one a GAP above it.
    if (tool === 'block' || tool === 'plate') {
      const face = (e.target as Element).getAttribute('data-face');
      const b = boxOf(piece);
      return startDraw(e, face === 'top' ? b.z + b.h + GAP : GROUND);
    }
    let ids = selection;
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      ids = selection.includes(id) ? selection.filter(i => i !== id) : [...selection, id];
      editor.setSelection(ids);
      if (!ids.includes(id)) return;
    } else if (!selection.includes(id)) {
      ids = [id];
      editor.setSelection(ids);
    }
    const start = new Map(objects.filter(p => ids.includes(p.id) && !p.locked).map(p => [p.id, boxOf(p)]));
    update({ kind: 'move', x: e.clientX, y: e.clientY, vertical: e.altKey, start, moved: false });
    capture(e);
  };

  const handleDown = (key: 'w' | 'd' | 'h', e: PointerEvent) => {
    e.stopPropagation();
    const piece = selected[0];
    update({ kind: 'size', x: e.clientX, y: e.clientY, key, id: piece.id, start: boxOf(piece), moved: false });
    capture(e);
  };

  const backgroundDown = (e: PointerEvent) => {
    if (e.button === 1 || panning) { update({ kind: 'pan', x: e.clientX, y: e.clientY, view }); return capture(e); }
    if (e.button !== 0) return;
    if (tool === 'block' || tool === 'plate') return startDraw(e, GROUND);
    const p = local(e);
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    if (!additive) editor.setSelection([]);
    update({ kind: 'marquee', x: p.x, y: p.y, to: p, base: additive ? selection : [] });
    capture(e);
  };

  const pointerMove = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.kind === 'pan') return setView({ ...d.view, ox: d.view.ox + e.clientX - d.x, oy: d.view.oy + e.clientY - d.y });
    if (d.kind === 'draw') {
      const { point, guides } = drawPoint(e, d.z);
      setGuides(guides);
      return update({ ...d, to: point });
    }
    if (d.kind === 'marquee') {
      const to = local(e);
      const [x1, x2] = [Math.min(d.x, to.x), Math.max(d.x, to.x)], [y1, y2] = [Math.min(d.y, to.y), Math.max(d.y, to.y)];
      // Everything the rectangle touches, like Figma.
      const hit = objects.filter(p => !p.locked).filter(p => {
        const pts = vertices(boxOf(p)).map(project).map(toScreen);
        const xs = pts.map(q => q.x), ys = pts.map(q => q.y);
        return Math.max(...xs) >= x1 && Math.min(...xs) <= x2 && Math.max(...ys) >= y1 && Math.min(...ys) <= y2;
      }).map(p => p.id);
      editor.setSelection([...new Set([...d.base, ...hit])]);
      return update({ ...d, to });
    }
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    const step = e.shiftKey ? 10 : SNAP;
    if (d.kind === 'move') {
      if (!d.moved && Math.hypot(dx, dy) < 3) return;
      if (!d.moved) { d.moved = true; editor.checkpoint(); }
      const floor = unprojectFloor(dx / view.s, dy / view.s);
      const vertical = d.vertical || e.altKey;
      let off = vertical ? { x: 0, y: 0, z: snap(-dy / view.s, step) } : { x: snap(floor.x, step), y: snap(floor.y, step), z: 0 };
      if (!e.metaKey) {
        const pulled = snapMove(bounds([...d.start.values()]), off, othersThan(new Set(d.start.keys())), threshold, vertical ? ['z'] : ['x', 'y']);
        off = pulled.offset;
        setGuides(pulled.guides);
      } else setGuides([]);
      editor.updatePieces([...d.start.keys()], (_, p) => {
        const b = d.start.get(p.id)!;
        return { x: b.x + off.x, y: b.y + off.y, z: b.z + off.z };
      }, false);
    }
    if (d.kind === 'size') {
      const axis = AXIS[HANDLES.find(h => h.key === d.key)!.axis];
      const along = (dx * axis.x + dy * axis.y) / view.s;
      if (!d.moved && Math.abs(along * view.s) < 2) return;
      if (!d.moved) { d.moved = true; editor.checkpoint(); }
      let value = Math.max(SNAP, snap(d.start[d.key] + along, step));
      if (!e.metaKey) {
        const pulled = snapSize({ ...d.start, [d.key]: value }, d.key, othersThan(new Set([d.id])), threshold);
        value = pulled.size;
        setGuides(pulled.guides);
      }
      editor.updatePieces([d.id], () => ({ [d.key]: value }), false);
    }
  };

  const pointerUp = () => {
    const d = dragRef.current;
    if (d?.kind === 'draw') {
      const w = Math.abs(d.to.x - d.from.x), dd = Math.abs(d.to.y - d.from.y);
      const h = d.plate ? PLATE : 40;
      // A click without a drag places a default block centred on the point.
      const box = w >= 10 && dd >= 10
        ? { x: Math.min(d.from.x, d.to.x), y: Math.min(d.from.y, d.to.y), z: d.z, w, d: dd, h }
        : { x: d.from.x - 30, y: d.from.y - 30, z: d.z, w: 60, d: 60, h: d.plate ? PLATE : 60 };
      editor.add(d.plate ? 'plate' : 'block', box);
      editor.setTool('move');
    }
    setGuides([]);
    update(null);
  };

  const contextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const target = (e.target as Element).closest('[data-object]')?.getAttribute('data-object');
    const ids = target ? (selection.includes(target) ? selection : [target]) : selection;
    if (target && !selection.includes(target)) editor.setSelection(ids);
    const p = local(e);
    setMenu({
      x: e.clientX, y: e.clientY,
      items: ids.length ? pieceMenu(editor, ids) : [
        { label: 'Вписать', shortcut: '⇧1', onSelect: fitView },
        { label: 'Масштаб 100%', shortcut: '⇧0', onSelect: () => zoomAt(1 / view.s, p.x, p.y) },
        'separator',
        { label: 'Выделить всё', shortcut: '⌘A', onSelect: () => editor.setSelection(objects.filter(o => !o.locked).map(o => o.id)) },
      ],
    });
  };

  // Floor grid on the implied ground, 10 units per cell, grown to fit the scene.
  const extent = boxes.length ? bounds(boxes) : undefined;
  const lo = Math.min(-300, Math.floor(Math.min(extent?.x ?? 0, extent?.y ?? 0) / 50) * 50 - 100);
  const hi = Math.max(300, Math.ceil(Math.max((extent?.x ?? 0) + (extent?.w ?? 0), (extent?.y ?? 0) + (extent?.d ?? 0)) / 50) * 50 + 100);
  const grid: string[] = [];
  const line = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const p = project({ ...a, z: GROUND }), q = project({ ...b, z: GROUND });
    return `M ${p.x} ${p.y} L ${q.x} ${q.y}`;
  };
  for (let i = lo; i <= hi; i += 10) grid.push(line({ x: i, y: lo }, { x: i, y: hi }), line({ x: lo, y: i }, { x: hi, y: i }));

  const single = selected.length === 1 && !selected[0].locked ? boxOf(selected[0]) : undefined;
  const moving = drag?.kind === 'move' || drag?.kind === 'size';
  const draft = drag?.kind === 'draw' ? {
    x: Math.min(drag.from.x, drag.to.x), y: Math.min(drag.from.y, drag.to.y), z: drag.z,
    w: Math.max(1, Math.abs(drag.to.x - drag.from.x)), d: Math.max(1, Math.abs(drag.to.y - drag.from.y)), h: drag.plate ? PLATE : 40,
  } : undefined;
  // Size badge under the selection, as in Figma.
  const badgeBox = draft ?? single;
  const badge = badgeBox && (() => {
    const pts = vertices(badgeBox).map(project).map(toScreen);
    return { x: (Math.min(...pts.map(p => p.x)) + Math.max(...pts.map(p => p.x))) / 2, y: Math.max(...pts.map(p => p.y)) + 10, text: `${fmt(badgeBox.w)} × ${fmt(badgeBox.d)} × ${fmt(badgeBox.h)}` };
  })();
  const cursor = panning ? (drag?.kind === 'pan' ? 'grabbing' : 'grab') : tool === 'block' || tool === 'plate' ? 'crosshair' : 'default';

  return (
    <div className={`canvas${moving ? ' is-moving' : ''}`} ref={host} style={{ cursor }}
      onPointerDown={backgroundDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}
      onContextMenu={contextMenu}>
      <svg width={size.w} height={size.h} className={`iso-art workspace${mode === 'hover' ? ' is-active' : ''}${panning || tool !== 'move' ? ' is-tool' : ''}`}>
        <g transform={`translate(${view.ox} ${view.oy}) scale(${view.s})`}>
          <path className="grid" d={grid.join(' ')} />
          {[...selected.map(boxOf), ...(draft ? [draft] : [])].map((b, i) => {
            const foot = [0, 1, 2, 3].map(j => project({ ...vertices(b)[j], z: GROUND }));
            const drops = b.z > GROUND ? [0, 1, 2, 3].map(j => {
              const top = project(vertices(b)[j]);
              return `M ${foot[j].x} ${foot[j].y} L ${top.x} ${top.y}`;
            }).join(' ') : '';
            return <path key={i} className="footprint" d={`M ${foot.map(q => `${q.x} ${q.y}`).join(' L ')} Z ${drops}`} />;
          })}
          <Art ids={objects.map(p => p.id)} boxes={boxes} locked={locked} onPiecePointerDown={pieceDown}
            onPieceEnter={id => !drag && editor.setHovered(id)} onPieceLeave={() => editor.setHovered(null)} />
          {draft && <g className="draft"><Art ids={['draft']} boxes={[draft]} /></g>}
          {/* The other state of selected blocks, so the hover offset stays visible. */}
          {selected.filter(p => hoverKind(p) !== 'rest').map(p =>
            <path key={p.id} className="ghost" d={outline(mode === 'hover' ? pick(p) : hoverBox(p))} />)}
          {hovered && !selection.includes(hovered) && objects.find(p => p.id === hovered) &&
            <path className="hover-outline" d={outline(boxOf(objects.find(p => p.id === hovered)!))} />}
          {selected.map(p => <path key={p.id} className="select-outline" d={outline(boxOf(p))} />)}
          {guides.map((g, i) => {
            const a = project(g.from), b = project(g.to);
            return <path key={i} className="guide" d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`} />;
          })}
        </g>
        {single && !moving && HANDLES.map(h => {
          const p = toScreen(project(h.at(single)));
          return <rect key={h.key} className={`handle handle-${h.axis}`} x={p.x - 4} y={p.y - 4} width="8" height="8" rx="1.5"
            onPointerDown={e => handleDown(h.key, e)} />;
        })}
        {badge && <g className="badge" transform={`translate(${badge.x} ${badge.y})`}>
          <rect x={-(badge.text.length * 3.3 + 8)} y="0" width={badge.text.length * 6.6 + 16} height="18" rx="3" />
          <text x="0" y="12.5">{badge.text}</text>
        </g>}
        {drag?.kind === 'marquee' && <rect className="marquee"
          x={Math.min(drag.x, drag.to.x)} y={Math.min(drag.y, drag.to.y)}
          width={Math.abs(drag.to.x - drag.x)} height={Math.abs(drag.to.y - drag.y)} />}
      </svg>
      {mode === 'hover' && <div className="mode-chip">Наведение</div>}
      <button className="zoom" onClick={fitView} data-tip="Вписать" data-kbd="⇧1">{Math.round(view.s * 100)}%</button>
      {menu && <Menu {...menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

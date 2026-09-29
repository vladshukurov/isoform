import { useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Lock, LockOpen, TriangleAlert } from 'lucide-react';
import { Glyph } from './Glyph';
import { ENTER } from '../anim';
import type { Editor } from '../editor';
import { hoverKind, type Piece } from '../model';
import { overlaps } from '../review';
import { pieceMenu } from './actions';
import { Menu, type MenuItem } from './Menu';

type Drop = { id: string; above: boolean };

// Painter order, front first: a row covers everything listed below it.
export function LayersPanel({ editor }: { editor: Editor }) {
  const { scene, selection, hovered } = editor;
  const editing = editor.renaming, setEditing = editor.setRenaming;
  const [drop, setDrop] = useState<Drop | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const anchor = useRef<string | null>(null);
  const dragging = useRef<string[]>([]);
  const flags = useMemo(() => scene ? overlaps(scene) : new Map<string, Set<string>>(), [scene]);
  if (!scene) return <div className="layers" />;
  const list = [...scene.objects].reverse();
  // Each animated row carries its bit of the timeline: when it starts, how long it runs.
  const total = Math.max(1.2, Math.max(0, ...scene.objects.filter(p => hoverKind(p) !== 'rest').map(p => p.delay ?? 0)) + ENTER);

  const click = (p: Piece, e: React.MouseEvent) => {
    if (e.shiftKey && anchor.current) {
      const a = list.findIndex(o => o.id === anchor.current), b = list.findIndex(o => o.id === p.id);
      return editor.setSelection(list.slice(Math.min(a, b), Math.max(a, b) + 1).map(o => o.id));
    }
    anchor.current = p.id;
    editor.setSelection(e.metaKey || e.ctrlKey
      ? selection.includes(p.id) ? selection.filter(i => i !== p.id) : [...selection, p.id]
      : [p.id]);
  };

  // Dropping above a row puts the blocks just in front of it.
  const place = ({ id, above }: Drop) => {
    const ids = dragging.current;
    if (!ids.length || ids.includes(id)) return;
    const order = scene.objects, at = order.findIndex(p => p.id === id);
    const before = above ? order.slice(at + 1).find(p => !ids.includes(p.id))?.id ?? null : id;
    editor.moveBefore(ids, before);
  };

  if (!list.length) return <div className="layers"><div className="layers-empty"><span>Пока пусто</span></div></div>;
  return (
    <div className="layers" onClick={e => { if (e.target === e.currentTarget) editor.setSelection([]); }}>
      {list.map((p, i) => {
        const kind = hoverKind(p);
        const isSelected = selection.includes(p.id);
        // Neighbouring selected rows join into one block, as in Figma.
        const joinUp = isSelected && selection.includes(list[i - 1]?.id), joinDown = isSelected && selection.includes(list[i + 1]?.id);
        const cls = ['layer', isSelected && 'is-selected', joinUp && 'join-up', joinDown && 'join-down', hovered === p.id && 'is-hovered', p.hidden && 'is-hidden',
          drop?.id === p.id && (drop.above ? 'drop-above' : 'drop-below')].filter(Boolean).join(' ');
        return (
          <div key={p.id} className={cls} draggable={editing !== p.id}
            onClick={e => click(p, e)}
            onDoubleClick={() => setEditing(p.id)}
            onPointerEnter={() => editor.setHovered(p.id)} onPointerLeave={() => editor.setHovered(null)}
            onContextMenu={e => {
              e.preventDefault();
              const ids = isSelected ? selection : [p.id];
              if (!isSelected) editor.setSelection(ids);
              setMenu({ x: e.clientX, y: e.clientY, items: pieceMenu(editor, ids) });
            }}
            onDragStart={e => {
              dragging.current = isSelected ? selection : [p.id];
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={e => {
              e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              setDrop({ id: p.id, above: e.clientY < r.top + r.height / 2 });
            }}
            onDragLeave={() => setDrop(d => d?.id === p.id ? null : d)}
            onDrop={e => { e.preventDefault(); if (drop) place(drop); setDrop(null); dragging.current = []; }}
            onDragEnd={() => { setDrop(null); dragging.current = []; }}>
            <span className="layer-icon"><Glyph box={p} /></span>
            {editing === p.id
              ? <input className="layer-name" autoFocus defaultValue={p.id}
                  onClick={e => e.stopPropagation()}
                  onBlur={e => { editor.rename(p.id, e.target.value.trim()); setEditing(null); }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setEditing(null);
                    e.stopPropagation();
                  }}
                  onChange={e => { e.target.value = e.target.value.replace(/[^\w-]/g, ''); }} />
              : <span className="layer-name">{p.id}</span>}
            <span className="layer-status">
              {flags.has(p.id) && <span className="layer-warn" data-tip={`Пересекается с ${[...flags.get(p.id)!].join(', ')}`}><TriangleAlert size={14} /></span>}
              {kind !== 'rest' && editor.mode === 'hover' && <span className="layer-track">
                <i style={{ left: `${(p.delay ?? 0) / total * 100}%`, width: `${ENTER / total * 100}%` }} />
              </span>}
            </span>
            <button className={`layer-toggle${p.locked ? ' is-on' : ''}`} aria-label={p.locked ? 'Разблокировать' : 'Заблокировать'}
              onClick={e => { e.stopPropagation(); editor.toggle([p.id], 'locked'); }}>
              {p.locked ? <Lock size={14} /> : <LockOpen size={14} />}
            </button>
            <button className={`layer-toggle${p.hidden ? ' is-on' : ''}`} aria-label={p.hidden ? 'Показать' : 'Скрыть'}
              onClick={e => { e.stopPropagation(); editor.toggle([p.id], 'hidden'); }}>
              {p.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        );
      })}
      {menu && <Menu {...menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

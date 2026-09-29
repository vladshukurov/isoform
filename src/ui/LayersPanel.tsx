import { useRef, useState } from 'react';
import { Box, Eye, EyeOff, Layers2, Lock, LockOpen, MoveUpRight, Scaling } from 'lucide-react';
import type { Editor } from '../editor';
import { hoverKind, PLATE, type Piece } from '../model';
import { pieceMenu } from './actions';
import { Menu, type MenuItem } from './Menu';

type Drop = { id: string; above: boolean };

// Painter order, front first: a row covers everything listed below it.
export function LayersPanel({ editor }: { editor: Editor }) {
  const { scene, selection, hovered } = editor;
  const [editing, setEditing] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const anchor = useRef<string | null>(null);
  const dragging = useRef<string[]>([]);
  if (!scene) return <div className="layers" />;
  const list = [...scene.objects].reverse();

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

  return (
    <div className="layers" onClick={e => { if (e.target === e.currentTarget) editor.setSelection([]); }}>
      {list.map(p => {
        const kind = hoverKind(p);
        const isSelected = selection.includes(p.id);
        const cls = ['layer', isSelected && 'is-selected', hovered === p.id && 'is-hovered', p.hidden && 'is-hidden',
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
              setMenu({ x: e.clientX, y: e.clientY, items: pieceMenu({ ...editor, selection: ids, selected: scene.objects.filter(o => ids.includes(o.id)) }) });
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
            <span className="layer-icon">{p.h <= PLATE + 4 ? <Layers2 size={14} /> : <Box size={14} />}</span>
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
            {kind !== 'rest' && <span className="layer-motion" title={kind === 'move' ? 'Едет при наведении' : 'Меняет форму при наведении'}>
              {kind === 'move' ? <MoveUpRight size={12} /> : <Scaling size={12} />}
            </span>}
            <button className={`layer-toggle${p.locked ? ' is-on' : ''}`} title={p.locked ? 'Разблокировать' : 'Заблокировать'}
              onClick={e => { e.stopPropagation(); editor.toggle([p.id], 'locked'); }}>
              {p.locked ? <Lock size={12} /> : <LockOpen size={12} />}
            </button>
            <button className={`layer-toggle${p.hidden ? ' is-on' : ''}`} title={p.hidden ? 'Показать' : 'Скрыть'}
              onClick={e => { e.stopPropagation(); editor.toggle([p.id], 'hidden'); }}>
              {p.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
            </button>
          </div>
        );
      })}
      {menu && <Menu {...menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

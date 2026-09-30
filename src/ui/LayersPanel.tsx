import { useMemo, useRef, useState } from 'react';
import { Box, ChevronDown, ChevronRight, Eye, EyeOff, Folder, FolderOpen, Lock, LockOpen, TriangleAlert } from 'lucide-react';
import { Glyph } from './Glyph';
import { ENTER } from '../anim';
import type { Editor } from '../editor';
import { hoverKind, type Piece } from '../model';
import { overlaps } from '../review';
import { pieceMenu } from './actions';
import { EmptyState, Kbd } from './kit';
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
  // Folded groups, and the group being renamed; the panel's own state.
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [naming, setNaming] = useState<string | null>(null);
  // While Claude writes this file, overlaps are half-done work, not mistakes.
  const drafting = editor.claude.running && editor.claude.job?.file === editor.current;
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

  if (!list.length) return (
    <div className="layers">
      <EmptyState icon={<Box size={18} />} title="Пока пусто">
        <Kbd>B</Kbd> блок · <Kbd>P</Kbd> плита · <Kbd>⌘K</Kbd> Claude
      </EmptyState>
    </div>
  );
  // Double click on a row's icon brings the camera to it.
  const focus = (ids: string[]) => window.dispatchEvent(new CustomEvent('isoform:focus', { detail: ids }));

  // A group's header row: fold, select all its blocks, rename, hide, lock, drag.
  const groupRow = (name: string) => {
    const members = scene.objects.filter(o => o.group === name), ids = members.map(o => o.id);
    const all = ids.every(id => selection.includes(id)), open = !folded.has(name);
    const hidden = members.every(o => o.hidden), locked = members.every(o => o.locked);
    return (
      <div key={`group:${name}`} className={['layer', 'is-group', all && 'is-selected', all && open && 'join-down', hidden && 'is-hidden', locked && 'is-locked'].filter(Boolean).join(' ')} draggable={naming !== name}
        onClick={e => editor.setSelection(e.metaKey || e.ctrlKey ? (all ? selection.filter(i => !ids.includes(i)) : [...new Set([...selection, ...ids])]) : ids)}
        onDoubleClick={() => setNaming(name)}
        onContextMenu={e => { e.preventDefault(); editor.setSelection(ids); setMenu({ x: e.clientX, y: e.clientY, items: pieceMenu(editor, ids) }); }}
        onDragStart={e => { dragging.current = ids; e.dataTransfer.effectAllowed = 'move'; }}
        onDragOver={e => { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setDrop({ id: ids.at(-1)!, above: e.clientY < r.top + r.height / 2 }); }}
        onDrop={e => { e.preventDefault(); if (drop) place(drop); setDrop(null); dragging.current = []; }}
        onDragEnd={() => { setDrop(null); dragging.current = []; }}>
        <button className="layer-caret" aria-label={open ? 'Свернуть' : 'Развернуть'} aria-expanded={open}
          onClick={e => { e.stopPropagation(); setFolded(f => { const n = new Set(f); open ? n.add(name) : n.delete(name); return n; }); }}>
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <span className="layer-icon" onDoubleClick={e => { e.stopPropagation(); focus(ids); }}>{open ? <FolderOpen size={14} /> : <Folder size={14} />}</span>
        {naming === name
          ? <input className="layer-name" autoFocus defaultValue={name} onClick={e => e.stopPropagation()}
              onBlur={e => { editor.renameGroup(name, e.target.value.trim()); setNaming(null); }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setNaming(null); e.stopPropagation(); }}
              onChange={e => { e.target.value = e.target.value.replace(/[^\w-]/g, ''); }} />
          : <span className="layer-name">{name}</span>}
        <span className="layer-count">{members.length}</span>
        <button className={`layer-toggle${locked ? ' is-on' : ''}`} aria-label={locked ? 'Разблокировать группу' : 'Заблокировать группу'}
          onClick={e => { e.stopPropagation(); editor.toggle(ids, 'locked'); }}>{locked ? <Lock size={14} /> : <LockOpen size={14} />}</button>
        <button className={`layer-toggle${hidden ? ' is-on' : ''}`} aria-label={hidden ? 'Показать группу' : 'Скрыть группу'}
          onClick={e => { e.stopPropagation(); editor.toggle(ids, 'hidden'); }}>{hidden ? <EyeOff size={14} /> : <Eye size={14} />}</button>
      </div>
    );
  };

  return (
    <div className="layers" onClick={e => { if (e.target === e.currentTarget) editor.setSelection([]); }}>
      {list.flatMap((p, i) => {
        const head = p.group && list[i - 1]?.group !== p.group ? [groupRow(p.group)] : [];
        if (p.group && folded.has(p.group)) return head;
        const kind = hoverKind(p);
        const isSelected = selection.includes(p.id);
        // Neighbouring selected rows join into one block, as in Figma.
        const firstInGroup = !!p.group && list[i - 1]?.group !== p.group;
        const joinUp = isSelected && (selection.includes(list[i - 1]?.id) || (firstInGroup && scene.objects.filter(o => o.group === p.group).every(o => selection.includes(o.id)))), joinDown = isSelected && selection.includes(list[i + 1]?.id);
        const cls = ['layer', p.group && 'is-member', isSelected && 'is-selected', joinUp && 'join-up', joinDown && 'join-down', hovered === p.id && 'is-hovered', p.hidden && 'is-hidden', p.locked && 'is-locked',
          drop?.id === p.id && (drop.above ? 'drop-above' : 'drop-below')].filter(Boolean).join(' ');
        return [...head, (
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
            <span className="layer-icon" onDoubleClick={e => { e.stopPropagation(); editor.setSelection([p.id]); focus([p.id]); }}><Glyph box={p} /></span>
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
              {flags.has(p.id) && !drafting && <span className="layer-warn" data-tip={`Пересекается с ${[...flags.get(p.id)!].join(', ')}`}><TriangleAlert size={14} /></span>}
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
        )];
      })}
      {menu && <Menu {...menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

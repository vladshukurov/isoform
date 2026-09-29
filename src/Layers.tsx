import { useState } from 'react';
import type { Editor } from './editor';
import { hoverKind } from './model';

const MARK = { rest: '', move: '↗', morph: '◇' };

// Painter order, front first: a block covers everything listed below it.
export function Layers({ editor }: { editor: Editor }) {
  const { scene, selection } = editor;
  const [dragging, setDragging] = useState<string | null>(null);
  if (!scene) return null;
  const list = [...scene.objects].reverse();
  const click = (id: string, additive: boolean) => editor.setSelection(additive
    ? selection.includes(id) ? selection.filter(i => i !== id) : [...selection, id]
    : [id]);

  return (
    <section className="layers">
      <h2>Порядок <small>спереди → сзади</small></h2>
      <ol>
        {list.map(p => (
          <li key={p.id} draggable className={selection.includes(p.id) ? 'is-selected' : undefined}
            onClick={e => click(p.id, e.shiftKey || e.metaKey)}
            onDragStart={() => setDragging(p.id)}
            onDragOver={e => e.preventDefault()}
            onDrop={() => {
              if (dragging && dragging !== p.id) editor.moveTo(dragging, scene.objects.findIndex(o => o.id === p.id));
              setDragging(null);
            }}>
            <span>{p.id}</span>
            <i title={{ rest: '', move: 'Едет при наведении', morph: 'Меняет форму при наведении' }[hoverKind(p)]}>{MARK[hoverKind(p)]}</i>
          </li>
        ))}
      </ol>
      <div className="row">
        <button onClick={() => editor.reorder(1)} disabled={!selection.length} title="]">Вперёд</button>
        <button onClick={() => editor.reorder(-1)} disabled={!selection.length} title="[">Назад</button>
        <button onClick={editor.autoOrder} title="Сортировать по глубине. Сплетённые конструкции (кольца, ящики в корпусе) потом поправьте вручную">По глубине</button>
      </div>
    </section>
  );
}

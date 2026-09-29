import { useEffect, useState } from 'react';
import type { Editor } from './editor';
import { BOX_KEYS, hoverBox, hoverKind, pick, type BoxKey, type Piece } from './model';

const LABEL: Record<BoxKey, string> = { x: 'X', y: 'Y', z: 'Z', w: 'Ш', d: 'Г', h: 'В' };

// Commits on Enter or blur, so typing "1" on the way to "120" doesn't redraw.
function NumberField({ label, value, step = 2, min, changed, onCommit }: {
  label: string; value: number; step?: number; min?: number; changed?: boolean; onCommit: (v: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(+value.toFixed(3))), [value]);
  const commit = () => {
    const v = Number(text.replace(',', '.'));
    if (Number.isFinite(v) && (min === undefined || v >= min) && v !== value) onCommit(v); else setText(String(value));
  };
  return (
    <label className={`field${changed ? ' is-changed' : ''}`}>
      <span>{label}</span>
      <input value={text} inputMode="decimal" onChange={e => setText(e.target.value)} onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const v = +(value + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 5 : 1)).toFixed(3);
            if (min === undefined || v >= min) onCommit(v);
          }
        }} />
    </label>
  );
}

function describeHover(piece: Piece) {
  const kind = hoverKind(piece), to = hoverBox(piece);
  if (kind === 'rest') return 'При наведении стоит на месте';
  if (kind === 'morph') return 'При наведении меняет форму';
  const off = (['x', 'y', 'z'] as const).map(k => to[k] - piece[k]).map(v => (v > 0 ? '+' : '') + v);
  return `При наведении едет на (${off.join(', ')})`;
}

export function Inspector({ editor }: { editor: Editor }) {
  const { scene, selected, mode } = editor;
  const [id, setId] = useState('');
  const piece = selected.length === 1 ? selected[0] : undefined;
  useEffect(() => setId(piece?.id ?? ''), [piece?.id]);
  if (!scene) return null;

  return (
    <section className="inspector">
      <h2>Сцена</h2>
      <label className="field wide"><span>Название</span>
        <input value={scene.title} onChange={e => editor.change(s => ({ ...s, title: e.target.value }), false)}
          onFocus={editor.checkpoint} />
      </label>
      <label className="field wide"><span>Движение</span>
        <select value={scene.motion} onChange={e => editor.change(s => ({ ...s, motion: e.target.value as typeof s.motion }))}>
          <option value="mechanical">Механизм — детали ездят как настоящие</option>
          <option value="layered">Слои — схема раскрывается и собирается при появлении</option>
        </select>
      </label>

      {piece && <>
        <h2>Блок</h2>
        <label className="field wide"><span>Имя</span>
          <input value={id} onChange={e => setId(e.target.value.replace(/[^\w-]/g, ''))}
            onBlur={() => { if (!editor.rename(piece.id, id)) setId(piece.id); }}
            onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
        </label>
        <p className="state-note">{mode === 'hover' ? 'Значения в состоянии наведения' : 'Значения в покое'}</p>
        <div className="grid3">
          {BOX_KEYS.map(k => {
            const box = mode === 'hover' ? hoverBox(piece) : pick(piece);
            return <NumberField key={k} label={LABEL[k]} value={box[k]} min={'wdh'.includes(k) ? .5 : undefined}
              changed={mode === 'hover' && piece.hover?.[k] !== undefined}
              onCommit={v => editor.updatePieces([piece.id], () => ({ [k]: v }))} />;
          })}
        </div>
        <p className="state-note">{describeHover(piece)}</p>
        <div className="row">
          <NumberField label="Задержка, с" value={piece.delay ?? 0} step={.02} min={0}
            onCommit={v => editor.updatePiece(piece.id, { delay: v || undefined })} />
          {piece.hover && <button onClick={() => editor.updatePiece(piece.id, { hover: undefined, delay: undefined })}>Убрать наведение</button>}
        </div>
      </>}
      {selected.length > 1 && <p className="state-note">Выбрано блоков: {selected.length}. Тащите или двигайте стрелками вместе.</p>}
    </section>
  );
}

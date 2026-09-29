import { useRef, useState } from 'react';
import {
  AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd, AlignHorizontalJustifyStart, AlignHorizontalSpaceAround,
  AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, AlignVerticalSpaceAround,
  ArrowDownToLine, ArrowRight, CopyPlus, Lock, FlipHorizontal2, FlipVertical2, Proportions, RotateCcw, RotateCw,
} from 'lucide-react';
import { CardPreview } from '../CardPreview';
import type { Editor } from '../editor';
import { BOX_KEYS, hoverBox, hoverKind, pick, type Box, type BoxKey, type Piece } from '../model';
import { Button, IconButton, Segmented, TextField } from './kit';
import { NumberField } from './NumberField';
import { Timeline } from './Timeline';

const FIELDS: [BoxKey, string][] = [['x', 'X'], ['y', 'Y'], ['z', 'Z'], ['w', 'W'], ['d', 'D'], ['h', 'H']];
const plural = (n: number) => n % 10 === 1 && n % 100 !== 11 ? 'блок' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'блока' : 'блоков';
const fmt = (v: number) => String(+v.toFixed(2));

// Figma's right panel: the design of the rest state, and a second tab for
// what changes on hover.
export function PropertiesPanel({ editor }: { editor: Editor }) {
  const { scene, selected, mode, current } = editor;
  const [pinned, setPinned] = useState(false);
  const [repeating, setRepeating] = useState(false);
  const [rep, setRep] = useState<{ count: number; gap: number; axis: 'x' | 'y' | 'z' }>({ count: 3, gap: 10, axis: 'x' });
  const [playing, setPlaying] = useState<number | null>(null);
  const playTimer = useRef(0);
  const titleEdit = useRef(false);
  if (!scene || !current) return null;
  const hover = mode === 'hover';
  const boxOf = (p: Piece): Box => hover ? hoverBox(p) : pick(p);
  const common = (read: (p: Piece) => number | undefined) => {
    const values = selected.map(read);
    return values.every(v => v === values[0]) ? values[0] : undefined;
  };
  const ids = selected.map(p => p.id);
  const allLocked = selected.length > 0 && selected.every(p => p.locked);
  const setDelay = (v: number, record = true) => editor.mapPieces(ids, p => ({ ...p, delay: v || undefined }), record);
  const play = (seconds: number) => {
    clearTimeout(playTimer.current);
    setPlaying(performance.now());
    playTimer.current = window.setTimeout(() => setPlaying(null), seconds * 1000 + 300);
  };

  return (
    <aside className="panel right surface">
      <Segmented label="Состояние" wide value={mode} onChange={editor.setMode}
        options={[{ value: 'rest', label: 'Дизайн', kbd: '1' }, { value: 'hover', label: 'Наведение', kbd: '2' }]} />
      {scene.objects.length > 0 && <div className={`preview${pinned ? ' is-pinned' : ''}`} onClick={() => setPinned(p => !p)}>
        <CardPreview scene={scene} hold={pinned || playing !== null} />
      </div>}

      {hover && (
        <section>
          <Segmented label="Характер движения" wide value={scene.motion} onChange={motion => editor.change(s => ({ ...s, motion }))}
            options={[{ value: 'mechanical', label: 'Механизм', tip: 'Детали ездят как настоящие механизмы' }, { value: 'layered', label: 'Раскрытие', tip: 'Схема раскрывается слоями' }]} />
        </section>
      )}

      {selected.length > 1 && (
        <section>
          <div className="section-head">
            <h3>Выравнивание</h3>
            <IconButton label="Размер как у последнего" tip={`Размер как у ${ids.at(-1)}`} onClick={() => editor.matchSize()}><Proportions size={14} /></IconButton>
          </div>
          <div className="align-grid">
            {(['x', 'y', 'z'] as const).map(axis => (
              <div key={axis} className="align-row">
                <span className="num-label">{axis.toUpperCase()}</span>
                {(axis === 'z'
                  ? [['min', AlignVerticalJustifyEnd, 'вниз'], ['center', AlignVerticalJustifyCenter, 'по центру'], ['max', AlignVerticalJustifyStart, 'вверх']] as const
                  : [['min', AlignHorizontalJustifyStart, 'к началу'], ['center', AlignHorizontalJustifyCenter, 'по центру'], ['max', AlignHorizontalJustifyEnd, 'к концу']] as const).map(([edge, Icon, tip]) => (
                  <IconButton key={edge} label={`${axis === 'z' ? 'По высоте' : axis.toUpperCase()} ${tip}`}
                    onClick={() => editor.alignTo(axis, edge)}><Icon size={14} /></IconButton>
                ))}
                <IconButton label={`Равные промежутки по ${axis === 'z' ? 'высоте' : axis.toUpperCase()}${selected.length < 3 ? ' — нужно от трёх блоков' : ''}`}
                  disabled={selected.length < 3} onClick={() => editor.distribute(axis)}>{axis === 'z' ? <AlignVerticalSpaceAround size={14} /> : <AlignHorizontalSpaceAround size={14} />}</IconButton>
              </div>
            ))}
          </div>
        </section>
      )}

      {selected.length > 0 && (
        <section className="block-head">
          <div className="block-name">
            <h3>{selected.length === 1 ? selected[0].id : `${selected.length} ${plural(selected.length)}`}</h3>
          </div>
          {allLocked && <div className="locked-note"><Lock size={13} /><span>{selected.length === 1 ? 'Заблокирован' : 'Заблокированы'}</span>
            <Button size="sm" onClick={() => editor.toggle(ids, 'locked')}>Разблокировать</Button></div>}
          {hover && selected.length === 1 && diff(selected[0]).map(([k, from, to]) => (
            <div key={k} className="diff"><b>{k.toUpperCase()}</b><s>{fmt(from)}</s><ArrowRight size={14} /><em>{fmt(to)}</em><span>{to > from ? '+' : '−'}{fmt(Math.abs(to - from))}</span></div>
          ))}
          <div className="fields">
            {FIELDS.map(([k, label]) => (
              <NumberField key={k} label={label} value={common(p => boxOf(p)[k])} disabled={allLocked}
                min={'wdh'.includes(k) ? .5 : undefined}
                accent={hover && selected.some(p => p.hover?.[k] !== undefined && p.hover[k] !== p[k])}
                onCommit={v => editor.updatePieces(ids, () => ({ [k]: v }))}
                onScrubStart={editor.checkpoint}
                onScrub={v => editor.updatePieces(ids, () => ({ [k]: v }), false)} />
            ))}
          </div>
        </section>
      )}

      {!hover && selected.length > 0 && !allLocked && (
        <section className="transform">
          <div className="tool-row">
              <IconButton variant="field" label="На опору" kbd="G" onClick={() => editor.drop()}><ArrowDownToLine size={14} /></IconButton>
              <IconButton variant="field" label="Повторить" pressed={repeating} onClick={() => setRepeating(r => !r)}><CopyPlus size={14} /></IconButton>
              <IconButton variant="field" label="Отразить по X" kbd="⇧H" onClick={() => editor.mirror('x')}><FlipHorizontal2 size={14} /></IconButton>
              <IconButton variant="field" label="Отразить по Y" kbd="⇧V" onClick={() => editor.mirror('y')}><FlipVertical2 size={14} /></IconButton>
              <IconButton variant="field" label="Повернуть на 90°" kbd="⇧R" onClick={() => editor.rotate()}><RotateCw size={14} /></IconButton>
            </div>
          {repeating && (
            <div className="repeat">
              <NumberField label="×" value={rep.count} step={1} min={2} onCommit={count => setRep(r => ({ ...r, count: Math.round(count) }))} />
              <NumberField label="↔" value={rep.gap} step={2} onCommit={gap => setRep(r => ({ ...r, gap }))} />
              <Segmented label="Ось" wide value={rep.axis} onChange={axis => setRep(r => ({ ...r, axis }))}
                options={(['x', 'y', 'z'] as const).map(axis => ({ value: axis, label: axis.toUpperCase() }))} />
              <Button variant="primary" onClick={() => { editor.repeat(rep.axis, rep.count, rep.gap); setRepeating(false); }}>Повторить</Button>
            </div>
          )}
        </section>
      )}

      {hover && selected.length > 0 && (
        <section>
          <div className="section-head">
            <h3>Задержка</h3>
            <IconButton label="Убрать наведение" disabled={!selected.some(p => p.hover)}
              onClick={() => editor.clearHover(ids)}><RotateCcw size={14} /></IconButton>
          </div>
          <div className="delay">
            <input type="range" className="slider" min={0} max={1} step={.02} value={common(p => p.delay ?? 0) ?? 0}
              style={{ '--v': `${(common(p => p.delay ?? 0) ?? 0) * 100}%` } as React.CSSProperties}
              onPointerDown={editor.checkpoint}
              onChange={e => setDelay(+e.target.value, false)} />
            <NumberField label="с" value={common(p => p.delay ?? 0)} step={.02} min={0}
              onCommit={v => setDelay(v)} onScrubStart={editor.checkpoint} onScrub={v => setDelay(v, false)} />
          </div>
        </section>
      )}

      {hover && <Timeline editor={editor} onPlay={play} playing={playing} />}
      {hover && !selected.length && !scene.objects.some(p => hoverKind(p) !== 'rest') && (
        <section><p className="panel-hint"><b>Ничего не двигается.</b> Выделите блок и сдвиньте или измените его здесь — так он поведёт себя при наведении.</p></section>
      )}

      {!hover && selected.length === 0 && (
        <section>
          <h3>Название</h3>
          <TextField value={scene.title} placeholder="Подпись для экранных читалок"
            onFocus={() => { titleEdit.current = false; }}
            onChange={e => {
              const title = e.target.value;
              // One undo step per editing session, recorded on the first keystroke.
              editor.change(s => ({ ...s, title }), !titleEdit.current);
              titleEdit.current = true;
            }} />
        </section>
      )}

    </aside>
  );
}

// The values hover changes, rest → hover.
const diff = (p: Piece) => BOX_KEYS.filter(k => p.hover?.[k] !== undefined && p.hover[k] !== p[k]).map(k => [k, p[k], p.hover![k]!] as const);

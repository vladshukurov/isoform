import { useRef, useState } from 'react';
import {
  AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd, AlignHorizontalJustifyStart, AlignHorizontalSpaceAround,
  AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, AlignVerticalSpaceAround,
  ArrowDownToLine, ArrowRight, CopyPlus, Hash, MoveHorizontal, FlipHorizontal2, FlipVertical2, Proportions, RotateCcw, RotateCw, Timer,
} from 'lucide-react';
import { CardPreview } from '../CardPreview';
import type { Editor } from '../editor';
import { BOX_KEYS, hoverBox, hoverKind, pick, PLATE, type Box, type BoxKey, type Piece } from '../model';
import { NumberField } from './NumberField';
import { Timeline } from './Timeline';

const FIELDS: [BoxKey, string][] = [['x', 'X'], ['y', 'Y'], ['z', 'Z'], ['w', 'W'], ['d', 'D'], ['h', 'H']];
const TIP: Record<BoxKey, string> = { x: 'X — тяните, чтобы менять', y: 'Y — тяните, чтобы менять', z: 'Высота над полом', w: 'Ширина', d: 'Глубина', h: 'Высота' };
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
  const setDelay = (v: number, record = true) => editor.mapPieces(ids, p => ({ ...p, delay: v || undefined }), record);
  const play = (seconds: number) => {
    clearTimeout(playTimer.current);
    setPlaying(performance.now());
    playTimer.current = window.setTimeout(() => setPlaying(null), seconds * 1000 + 300);
  };

  return (
    <aside className="panel right surface">
      <div className={`tabs${hover ? ' is-second' : ''}`} role="tablist">
        <i className="tabs-pill" />
        <button role="tab" aria-pressed={!hover} onClick={() => editor.setMode('rest')} data-tip="Дизайн" data-kbd="1">Дизайн</button>
        <button role="tab" aria-pressed={hover} onClick={() => editor.setMode('hover')} data-tip="Состояние при наведении" data-kbd="2">
          Наведение{scene.objects.some(p => hoverKind(p) !== 'rest') && <i className="tab-dot" />}
        </button>
      </div>
      {scene.objects.length > 0 && <div className={`preview${pinned ? ' is-pinned' : ''}`} onClick={() => setPinned(p => !p)}
        data-tip={pinned ? 'Отпустить наведение' : 'Наведите, чтобы проиграть; клик закрепляет'}>
        <CardPreview scene={scene} hold={pinned || playing !== null} />
      </div>}

      {hover && (
        <section>
          <div className="segmented wide">
            <button aria-pressed={scene.motion === 'mechanical'} data-tip="Детали ездят как настоящие: ящик выдвигается, тумблер переключается"
              onClick={() => scene.motion !== 'mechanical' && editor.change(s => ({ ...s, motion: 'mechanical' }))}>Механизм</button>
            <button aria-pressed={scene.motion === 'layered'} data-tip="Схема раскрывается слоями и собирается при появлении"
              onClick={() => scene.motion !== 'layered' && editor.change(s => ({ ...s, motion: 'layered' }))}>Раскрытие</button>
          </div>
        </section>
      )}

      {selected.length > 1 && (
        <section>
          <div className="section-head">
            <h3>Выравнивание</h3>
            <button className="icon" aria-label="Размер как у последнего" data-tip={`Размер как у ${ids.at(-1)}`} onClick={() => editor.matchSize()}><Proportions size={14} /></button>
          </div>
          <div className="align-grid">
            {(['x', 'y', 'z'] as const).map(axis => (
              <div key={axis} className="align-row">
                <span className="num-label">{axis.toUpperCase()}</span>
                {(axis === 'z'
                  ? [['min', AlignVerticalJustifyEnd, 'вниз'], ['center', AlignVerticalJustifyCenter, 'по центру'], ['max', AlignVerticalJustifyStart, 'вверх']] as const
                  : [['min', AlignHorizontalJustifyStart, 'к началу'], ['center', AlignHorizontalJustifyCenter, 'по центру'], ['max', AlignHorizontalJustifyEnd, 'к концу']] as const).map(([edge, Icon, tip]) => (
                  <button key={edge} className="icon" aria-label={`${axis.toUpperCase()} ${tip}`} data-tip={`${axis === 'z' ? 'По высоте' : axis.toUpperCase()} ${tip}`}
                    onClick={() => editor.alignTo(axis, edge)}><Icon size={14} /></button>
                ))}
                <button className="icon" aria-label={`Распределить по ${axis.toUpperCase()}`} data-tip={`Равные промежутки по ${axis === 'z' ? 'высоте' : axis.toUpperCase()}`}
                  disabled={selected.length < 3} onClick={() => editor.distribute(axis)}>{axis === 'z' ? <AlignVerticalSpaceAround size={14} /> : <AlignHorizontalSpaceAround size={14} />}</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {selected.length > 0 && (
        <section className="block-head">
          <div className="block-name">
            <h3>{selected.length === 1 ? selected[0].id : `${selected.length} ${plural(selected.length)}`}</h3>
            <span>{describe(selected)}</span>
          </div>
          {hover && selected.length === 1 && diff(selected[0]).map(([k, from, to]) => (
            <div key={k} className="diff"><b>{k.toUpperCase()}</b><s>{fmt(from)}</s><ArrowRight size={14} /><em>{fmt(to)}</em><span>{to > from ? '+' : '−'}{fmt(Math.abs(to - from))}</span></div>
          ))}
          <div className="fields">
            {FIELDS.map(([k, label]) => (
              <NumberField key={k} label={label} tip={TIP[k]} value={common(p => boxOf(p)[k])}
                min={'wdh'.includes(k) ? .5 : undefined}
                accent={hover && selected.some(p => p.hover?.[k] !== undefined && p.hover[k] !== p[k])}
                onCommit={v => editor.updatePieces(ids, () => ({ [k]: v }))}
                onScrubStart={editor.checkpoint}
                onScrub={v => editor.updatePieces(ids, () => ({ [k]: v }), false)} />
            ))}
          </div>
        </section>
      )}

      {!hover && selected.length > 0 && (
        <section className="transform">
          <div className="tool-row">
              <button className="icon" aria-label="На опору" data-tip="На опору" data-kbd="G" onClick={() => editor.drop()}><ArrowDownToLine size={14} /></button>
              <button className="icon" aria-label="Повторить" data-tip="Повторить" aria-pressed={repeating} onClick={() => setRepeating(r => !r)}><CopyPlus size={14} /></button>
              <button className="icon" aria-label="Отразить по X" data-tip="Отразить по X" data-kbd="⇧H" onClick={() => editor.mirror('x')}><FlipHorizontal2 size={14} /></button>
              <button className="icon" aria-label="Отразить по Y" data-tip="Отразить по Y" data-kbd="⇧V" onClick={() => editor.mirror('y')}><FlipVertical2 size={14} /></button>
              <button className="icon" aria-label="Повернуть на 90°" data-tip="Повернуть на 90°" data-kbd="⇧R" onClick={() => editor.rotate()}><RotateCw size={14} /></button>
            </div>
          {repeating && (
            <div className="repeat">
              <NumberField label={<Hash size={12} />} tip="Сколько всего" value={rep.count} step={1} min={2} onCommit={count => setRep(r => ({ ...r, count: Math.round(count) }))} />
              <NumberField label={<MoveHorizontal size={12} />} tip="Зазор" value={rep.gap} step={2} onCommit={gap => setRep(r => ({ ...r, gap }))} />
              <div className="segmented">
                {(['x', 'y', 'z'] as const).map(axis => (
                  <button key={axis} aria-pressed={rep.axis === axis} onClick={() => setRep(r => ({ ...r, axis }))}>{axis.toUpperCase()}</button>
                ))}
              </div>
              <button className="button is-primary" onClick={() => { editor.repeat(rep.axis, rep.count, rep.gap); setRepeating(false); }}>Повторить</button>
            </div>
          )}
        </section>
      )}

      {hover && selected.length > 0 && (
        <section>
          <div className="section-head">
            <h3>Задержка</h3>
            <button className="icon" aria-label="Убрать наведение" data-tip="Убрать наведение" disabled={!selected.some(p => p.hover)}
              onClick={() => editor.clearHover(ids)}><RotateCcw size={14} /></button>
          </div>
          <div className="delay">
            <input type="range" className="slider" min={0} max={1} step={.02} value={common(p => p.delay ?? 0) ?? 0}
              style={{ '--v': `${(common(p => p.delay ?? 0) ?? 0) * 100}%` } as React.CSSProperties}
              onPointerDown={editor.checkpoint}
              onChange={e => setDelay(+e.target.value, false)} />
            <NumberField label={<Timer size={12} />} tip="Секунды до начала движения" value={common(p => p.delay ?? 0)} step={.02} min={0}
              onCommit={v => setDelay(v)} onScrubStart={editor.checkpoint} onScrub={v => setDelay(v, false)} />
          </div>
        </section>
      )}

      {hover && <Timeline editor={editor} onPlay={play} playing={playing} />}

      {!hover && selected.length === 0 && (
        <section>
          <h3>Название</h3>
          <input className="text" value={scene.title} data-tip="Подпись для экранных читалок и <title> в SVG"
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

// What a block is, in a word or two, for the panel's heading.
function describe(pieces: Piece[]) {
  if (pieces.length > 1) {
    const moving = pieces.filter(p => hoverKind(p) !== 'rest').length;
    return moving ? `${moving} с наведением` : 'Без наведения';
  }
  const p = pieces[0], kind = hoverKind(p);
  const what = p.h <= PLATE + 4 ? 'Плита' : 'Блок';
  if (p.locked) return `${what} · заблокирован`;
  return kind === 'move' ? `${what} · едет при наведении` : kind === 'morph' ? `${what} · меняет форму при наведении` : what;
}

// The values hover changes, rest → hover.
const diff = (p: Piece) => BOX_KEYS.filter(k => p.hover?.[k] !== undefined && p.hover[k] !== p[k]).map(k => [k, p[k], p.hover![k]!] as const);

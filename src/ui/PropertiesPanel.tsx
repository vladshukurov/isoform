import { useRef, useState } from 'react';
import { Download, RotateCcw } from 'lucide-react';
import { CardPreview } from '../CardPreview';
import { downloadJson, downloadPng, downloadSvg } from '../download';
import type { Editor } from '../editor';
import { hoverBox, pick, type Box, type BoxKey, type Piece } from '../model';
import { NumberField } from './NumberField';
import { Timeline } from './Timeline';

const ROWS: { title: string; keys: [BoxKey, string][] }[] = [
  { title: 'Положение', keys: [['x', 'X'], ['y', 'Y'], ['z', 'Z']] },
  { title: 'Размер', keys: [['w', 'Ш'], ['d', 'Г'], ['h', 'В']] },
];
const TIP: Record<BoxKey, string> = { x: 'X', y: 'Y', z: 'Высота над полом', w: 'Ширина', d: 'Глубина', h: 'Высота' };

// Figma's right panel: the design of the rest state, and a second tab for
// what changes on hover.
export function PropertiesPanel({ editor, dark }: { editor: Editor; dark: boolean }) {
  const { scene, selected, mode, current } = editor;
  const [pinned, setPinned] = useState(false);
  const [playing, setPlaying] = useState<number | null>(null);
  const playTimer = useRef(0);
  const titleEdit = useRef(false);
  if (!scene || !current) return <aside className="panel right" />;
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
    <aside className="panel right">
      <div className="tabs" role="tablist">
        <button role="tab" aria-pressed={!hover} onClick={() => editor.setMode('rest')} data-tip="Дизайн" data-kbd="1">Дизайн</button>
        <button role="tab" aria-pressed={hover} onClick={() => editor.setMode('hover')} data-tip="Состояние при наведении" data-kbd="2">Наведение</button>
      </div>
      <div className={`preview${pinned ? ' is-pinned' : ''}`} onClick={() => setPinned(p => !p)}
        data-tip={pinned ? 'Отпустить наведение' : 'Наведите, чтобы проиграть; клик закрепляет'}>
        <CardPreview scene={scene} hold={pinned || playing !== null} />
      </div>

      {hover && (
        <section>
          <div className="segmented wide">
            <button aria-pressed={scene.motion === 'mechanical'} data-tip="Детали ездят как настоящие: ящик выдвигается, тумблер переключается"
              onClick={() => editor.change(s => ({ ...s, motion: 'mechanical' }))}>Механизм</button>
            <button aria-pressed={scene.motion === 'layered'} data-tip="Схема раскрывается слоями и собирается при появлении"
              onClick={() => editor.change(s => ({ ...s, motion: 'layered' }))}>Слои</button>
          </div>
        </section>
      )}

      {selected.length > 0 && ROWS.map(row => (
        <section key={row.title}>
          <h3>{row.title}</h3>
          <div className="fields">
            {row.keys.map(([k, label]) => (
              <NumberField key={k} label={label} tip={TIP[k]} value={common(p => boxOf(p)[k])}
                min={'wdh'.includes(k) ? .5 : undefined}
                accent={hover && selected.some(p => p.hover?.[k] !== undefined && p.hover[k] !== p[k])}
                onCommit={v => editor.updatePieces(ids, () => ({ [k]: v }))}
                onScrubStart={editor.checkpoint}
                onScrub={v => editor.updatePieces(ids, () => ({ [k]: v }), false)} />
            ))}
          </div>
        </section>
      ))}

      {hover && selected.length > 0 && (
        <section>
          <h3>Задержка</h3>
          <div className="fields">
            <NumberField label="с" tip="Секунды до начала движения" value={common(p => p.delay ?? 0)} step={.02} min={0}
              onCommit={v => setDelay(v)} onScrubStart={editor.checkpoint} onScrub={v => setDelay(v, false)} />
            <button className="icon" aria-label="Убрать наведение" data-tip="Убрать наведение" disabled={!selected.some(p => p.hover)}
              onClick={() => editor.clearHover(ids)}>
              <RotateCcw size={13} />
            </button>
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

      {!hover && (
        <section className="export">
          <h3>Экспорт</h3>
          <div className="fields">
            <button onClick={() => downloadSvg(current, scene)} data-tip="Разметка для сайта"><Download size={13} /> SVG</button>
            <button onClick={() => downloadPng(current, scene, dark ? 'dark' : 'light')} data-tip={`Картинка 2×, ${dark ? 'тёмная' : 'светлая'} тема`}><Download size={13} /> PNG</button>
            <button onClick={() => downloadJson(current, scene)} data-tip="Исходник сцены — можно открыть снова"><Download size={13} /> JSON</button>
          </div>
        </section>
      )}
    </aside>
  );
}

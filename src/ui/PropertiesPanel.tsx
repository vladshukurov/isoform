import { Download, RotateCcw } from 'lucide-react';
import { CardPreview } from '../CardPreview';
import { downloadJson, downloadSvg } from '../download';
import type { Editor } from '../editor';
import { hoverBox, pick, type Box, type BoxKey, type Piece } from '../model';
import { NumberField } from './NumberField';

const ROWS: { title: string; keys: [BoxKey, string][] }[] = [
  { title: 'Положение', keys: [['x', 'X'], ['y', 'Y'], ['z', 'Z']] },
  { title: 'Размер', keys: [['w', 'Ш'], ['d', 'Г'], ['h', 'В']] },
];
const HINT: Record<BoxKey, string> = { x: 'X', y: 'Y', z: 'Высота над полом', w: 'Ширина', d: 'Глубина', h: 'Высота' };

// Figma's right panel: the design of the rest state, and a second tab for
// what changes on hover.
export function PropertiesPanel({ editor }: { editor: Editor }) {
  const { scene, selected, mode, current } = editor;
  if (!scene || !current) return <aside className="panel right" />;
  const hover = mode === 'hover';
  const boxOf = (p: Piece): Box => hover ? hoverBox(p) : pick(p);
  const common = (read: (p: Piece) => number | undefined) => {
    const values = selected.map(read);
    return values.every(v => v === values[0]) ? values[0] : undefined;
  };
  const ids = selected.map(p => p.id);

  return (
    <aside className="panel right">
      <div className="tabs">
        <button aria-pressed={!hover} onClick={() => editor.setMode('rest')}>Дизайн</button>
        <button aria-pressed={hover} onClick={() => editor.setMode('hover')}>Наведение</button>
      </div>
      <div className="preview"><CardPreview scene={scene} /></div>

      {hover && (
        <section>
          <div className="segmented wide">
            <button aria-pressed={scene.motion === 'mechanical'} title="Детали ездят как настоящие: ящик выдвигается, тумблер переключается"
              onClick={() => editor.change(s => ({ ...s, motion: 'mechanical' }))}>Механизм</button>
            <button aria-pressed={scene.motion === 'layered'} title="Схема раскрывается слоями и собирается при появлении"
              onClick={() => editor.change(s => ({ ...s, motion: 'layered' }))}>Слои</button>
          </div>
        </section>
      )}

      {selected.length > 0 && ROWS.map(row => (
        <section key={row.title}>
          <h3>{row.title}</h3>
          <div className="fields">
            {row.keys.map(([k, label]) => (
              <NumberField key={k} label={label} title={HINT[k]} value={common(p => boxOf(p)[k])}
                min={'wdh'.includes(k) ? .5 : undefined}
                accent={hover && selected.some(p => p.hover?.[k] !== undefined)}
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
            <NumberField label="с" title="Секунды до начала движения" value={common(p => p.delay ?? 0)} step={.02} min={0}
              onCommit={v => editor.change(s => ({ ...s, objects: s.objects.map(p => ids.includes(p.id) ? { ...p, delay: v || undefined } : p) }))}
              onScrubStart={editor.checkpoint}
              onScrub={v => editor.change(s => ({ ...s, objects: s.objects.map(p => ids.includes(p.id) ? { ...p, delay: v || undefined } : p) }), false)} />
            <button className="icon" title="Убрать наведение" disabled={!selected.some(p => p.hover)}
              onClick={() => editor.change(s => ({ ...s, objects: s.objects.map(p => ids.includes(p.id) ? { ...p, hover: undefined, delay: undefined } : p) }))}>
              <RotateCcw size={13} />
            </button>
          </div>
        </section>
      )}

      {!hover && selected.length === 0 && (
        <section>
          <h3>Название</h3>
          <input className="text" value={scene.title} title="Подпись для экранных читалок и <title> в SVG"
            onFocus={editor.checkpoint} onChange={e => editor.change(s => ({ ...s, title: e.target.value }), false)} />
        </section>
      )}

      {!hover && (
        <section className="export">
          <h3>Экспорт</h3>
          <div className="fields">
            <button onClick={() => downloadSvg(current, scene)}><Download size={13} /> SVG</button>
            <button onClick={() => downloadJson(current, scene)} title="Исходник сцены — можно открыть снова"><Download size={13} /> JSON</button>
          </div>
        </section>
      )}
    </aside>
  );
}

import { Box, Hand, Layers2, MousePointer2, Redo2, Sparkles, Undo2 } from 'lucide-react';
import type { Editor, Tool } from '../editor';

const TOOLS: { tool: Tool; icon: React.ReactNode; tip: string; kbd: string }[] = [
  { tool: 'move', icon: <MousePointer2 size={16} />, tip: 'Выбор', kbd: 'V' },
  { tool: 'hand', icon: <Hand size={16} />, tip: 'Рука', kbd: 'H' },
  { tool: 'block', icon: <Box size={16} />, tip: 'Блок', kbd: 'B' },
  { tool: 'plate', icon: <Layers2 size={16} />, tip: 'Плита', kbd: 'P' },
];

// The floating tool bar at the bottom of the canvas, as in Figma UI3.
export function Toolbar({ editor, zoom }: { editor: Editor; zoom?: React.ReactNode }) {
  return (
    // Lives over the canvas: presses must not start a canvas drag.
    <div className="toolbar" onPointerDown={e => e.stopPropagation()} onContextMenu={e => e.stopPropagation()}>
      {TOOLS.map((t, i) => <span key={t.tool} className="toolbar-item">
        {i === 2 && <span className="toolbar-sep" />}
        <button className="icon" aria-pressed={editor.tool === t.tool} aria-label={t.tip} data-tip={t.tip} data-kbd={t.kbd} onClick={() => editor.setTool(t.tool)}>{t.icon}</button>
      </span>)}
      <span className="toolbar-sep" />
      <button className="icon" aria-label="Сгенерировать" data-tip="Описать словами" data-kbd="⌘K" aria-pressed={editor.aiOpen}
        onClick={() => editor.setAiOpen(!editor.aiOpen)}><Sparkles size={16} /></button>
      <span className="toolbar-sep" />
      <button className="icon" aria-label="Отменить" data-tip="Отменить" data-kbd="⌘Z" onClick={editor.undo}><Undo2 size={16} /></button>
      <button className="icon" aria-label="Вернуть" data-tip="Вернуть" data-kbd="⇧⌘Z" onClick={editor.redo}><Redo2 size={16} /></button>
      {zoom && <><span className="toolbar-sep" />{zoom}</>}
    </div>
  );
}

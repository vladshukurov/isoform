import { Hand, MousePointer2, Redo2, Undo2 } from 'lucide-react';
import type { Editor, Tool } from '../editor';
import { BlockIcon, PlateIcon } from './icons';

const TOOLS: { tool: Tool; icon: React.ReactNode; title: string }[] = [
  { tool: 'move', icon: <MousePointer2 size={16} />, title: 'Выбор · V' },
  { tool: 'hand', icon: <Hand size={16} />, title: 'Рука · H' },
  { tool: 'block', icon: <BlockIcon size={18} />, title: 'Блок · B — тяните по полу или по верху другого блока' },
  { tool: 'plate', icon: <PlateIcon size={18} />, title: 'Плита · P' },
];

// The floating tool bar at the bottom of the canvas, as in Figma UI3.
export function Toolbar({ editor }: { editor: Editor }) {
  return (
    <div className="toolbar">
      {TOOLS.map((t, i) => <span key={t.tool} className="toolbar-item">
        {i === 2 && <span className="toolbar-sep" />}
        <button className="icon" aria-pressed={editor.tool === t.tool} title={t.title} onClick={() => editor.setTool(t.tool)}>{t.icon}</button>
      </span>)}
      <span className="toolbar-sep" />
      <button className="icon" title="Отменить · ⌘Z" onClick={editor.undo}><Undo2 size={16} /></button>
      <button className="icon" title="Вернуть · ⇧⌘Z" onClick={editor.redo}><Redo2 size={16} /></button>
    </div>
  );
}

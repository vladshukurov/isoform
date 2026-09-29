import { useEffect, useState } from 'react';
import { ArrowDownUp } from 'lucide-react';
import { useEditor } from './editor';
import { Canvas } from './ui/Canvas';
import { AgentDialog, NewFileDialog, SeriesDialog, ShortcutsDialog } from './ui/Dialogs';
import { FileHeader } from './ui/FileHeader';
import { LayersPanel } from './ui/LayersPanel';
import { PropertiesPanel } from './ui/PropertiesPanel';
import { Toolbar } from './ui/Toolbar';

type Dialog = 'new' | 'series' | 'agent' | 'shortcuts' | null;
const typing = (e: KeyboardEvent) => !!(e.target as HTMLElement).closest('input, textarea, select');
const readTheme = () => { try { return localStorage.getItem('isoform-theme') === 'dark'; } catch { return false; } };

export function App() {
  const editor = useEditor();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dark, setDark] = useState(readTheme);
  const { scene, selection } = editor;

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try { localStorage.setItem('isoform-theme', dark ? 'dark' : 'light'); } catch { /* private mode */ }
  }, [dark]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e) || dialog) return;
      const cmd = e.metaKey || e.ctrlKey, key = e.key.toLowerCase();
      if (cmd && key === 'z') { e.preventDefault(); e.shiftKey ? editor.redo() : editor.undo(); return; }
      if (cmd && key === 'd') { e.preventDefault(); editor.duplicate(); return; }
      if (cmd && key === 'a') { e.preventDefault(); editor.setSelection(scene?.objects.filter(p => !p.hidden && !p.locked).map(p => p.id) ?? []); return; }
      if (cmd && e.shiftKey && key === 'h') { e.preventDefault(); editor.toggle(selection, 'hidden'); return; }
      if (cmd && e.shiftKey && key === 'l') { e.preventDefault(); editor.toggle(selection, 'locked'); return; }
      if (cmd) return;
      if (e.key === '?') setDialog('shortcuts');
      if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); editor.remove(); }
      if (e.key === 'Escape') { editor.tool !== 'move' ? editor.setTool('move') : editor.setSelection([]); }
      if (key === 'v') editor.setTool('move');
      if (key === 'h') editor.setTool('hand');
      if (key === 'b') editor.setTool('block');
      if (key === 'p') editor.setTool('plate');
      if (e.key === '1') editor.setMode('rest');
      if (e.key === '2') editor.setMode('hover');
      if (e.key === ']' || e.key === '}') e.shiftKey ? editor.toEdge(true) : editor.reorder(1);
      if (e.key === '[' || e.key === '{') e.shiftKey ? editor.toEdge(false) : editor.reorder(-1);
      // Arrows move along the drawing's axes: ←→ is X, ↑↓ is Y, with Alt ↑↓ is height.
      const step = e.shiftKey ? 10 : 2;
      const move = { ArrowLeft: [-step, 0, 0], ArrowRight: [step, 0, 0], ArrowUp: e.altKey ? [0, 0, step] : [0, -step, 0], ArrowDown: e.altKey ? [0, 0, -step] : [0, step, 0] }[e.key];
      if (move && selection.length) {
        e.preventDefault();
        editor.updatePieces(selection, b => ({ x: b.x + move[0], y: b.y + move[1], z: b.z + move[2] }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // With no files yet the app opens on the new-file picker.
  const empty = editor.loaded && !editor.current;

  return (
    <div className="app">
      <aside className="panel left">
        <FileHeader editor={editor} dark={dark} onDark={() => setDark(d => !d)}
          onNew={() => setDialog('new')} onSeries={() => setDialog('series')}
          onAgent={() => setDialog('agent')} onShortcuts={() => setDialog('shortcuts')} />
        {scene && <div className="panel-title">
          <h3>Слои</h3>
          <button className="icon" title="Порядок по глубине" onClick={editor.autoOrder}><ArrowDownUp size={13} /></button>
        </div>}
        <LayersPanel editor={editor} />
      </aside>

      <main className="stage">
        <Canvas editor={editor} />
        {scene && <Toolbar editor={editor} />}
        {editor.message && editor.save !== 'error' && <div className="toast" onClick={() => editor.setMessage(null)}>{editor.message}</div>}
      </main>

      <PropertiesPanel editor={editor} />

      {(dialog === 'new' || (empty && dialog !== 'agent')) &&
        <NewFileDialog editor={editor} onClose={empty ? undefined : () => setDialog(null)} onAgent={() => setDialog('agent')} />}
      {dialog === 'series' && <SeriesDialog editor={editor} onClose={() => setDialog(null)} />}
      {dialog === 'agent' && <AgentDialog editor={editor} onClose={() => setDialog(null)} />}
      {dialog === 'shortcuts' && <ShortcutsDialog onClose={() => setDialog(null)} />}
    </div>
  );
}

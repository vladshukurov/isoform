import { useEffect, useRef, useState } from 'react';
import { ArrowDownUp, FileUp } from 'lucide-react';
import { parse as parseBlocks, serialize } from './clipboard';
import { readSceneFile } from './download';
import { useEditor } from './editor';
import { Canvas } from './ui/Canvas';
import { AgentDialog, ConfirmDialog, NewFileDialog, SeriesDialog, ShortcutsDialog } from './ui/Dialogs';
import { FileHeader } from './ui/FileHeader';
import { LayersPanel } from './ui/LayersPanel';
import { PropertiesPanel } from './ui/PropertiesPanel';
import { Toolbar } from './ui/Toolbar';
import { Tooltip } from './ui/Tooltip';

type Dialog = 'new' | 'series' | 'agent' | 'shortcuts' | 'delete' | null;
const typing = (target: EventTarget | null) => !!(target as HTMLElement | null)?.closest?.('input, textarea, select');
const readTheme = () => { try { return localStorage.getItem('isoform-theme') === 'dark'; } catch { return false; } };

export function App() {
  const editor = useEditor();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dark, setDark] = useState(readTheme);
  const [chrome, setChrome] = useState(true);
  const [dropping, setDropping] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const pendingPaste = useRef(0);
  const { scene, selection } = editor;

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try { localStorage.setItem('isoform-theme', dark ? 'dark' : 'light'); } catch { /* private mode */ }
  }, [dark]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target) || dialog) return;
      const cmd = e.metaKey || e.ctrlKey, key = e.key.toLowerCase();
      if (cmd && key === 'z') { e.preventDefault(); e.shiftKey ? editor.redo() : editor.undo(); return; }
      if (cmd && key === 'd') { e.preventDefault(); editor.duplicate(); return; }
      if (cmd && key === 'a') { e.preventDefault(); editor.setSelection(scene?.objects.filter(p => !p.hidden && !p.locked).map(p => p.id) ?? []); return; }
      if (cmd && e.shiftKey && key === 'h') { e.preventDefault(); editor.toggle(selection, 'hidden'); return; }
      if (cmd && e.shiftKey && key === 'l') { e.preventDefault(); editor.toggle(selection, 'locked'); return; }
      if (cmd && e.key === '\\') { e.preventDefault(); setChrome(c => !c); return; }
      if (cmd && key === 'o') { e.preventDefault(); picker.current?.click(); return; }
      if (cmd && key === 'c' && selection.length) { editor.copy(); return; }
      if (cmd && key === 'x' && selection.length) { e.preventDefault(); editor.cut(); return; }
      // The paste event below brings the system clipboard; if the browser
      // doesn't send one, fall back to what was copied in this tab.
      if (cmd && key === 'v' && scene) { pendingPaste.current = window.setTimeout(() => editor.paste(), 80); return; }
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
    // Copy puts our blocks on the system clipboard too, so they reach other tabs and agents.
    const onCopy = (e: ClipboardEvent) => {
      if (typing(e.target) || dialog || !selection.length) return;
      e.preventDefault();
      e.clipboardData?.setData('text/plain', serialize(editor.selected));
      editor.copy(selection, false);
    };
    const onPaste = (e: ClipboardEvent) => {
      if (typing(e.target) || dialog || !scene) return;
      clearTimeout(pendingPaste.current);
      const text = e.clipboardData?.getData('text/plain') ?? '';
      e.preventDefault();
      editor.paste(parseBlocks(text) ? text : undefined);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('copy', onCopy);

    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('copy', onCopy);

      window.removeEventListener('paste', onPaste);
    };
  });

  const open = async (files: FileList | null) => {
    for (const file of [...files ?? []].filter(f => /\.json$/i.test(f.name))) {
      const { name, text } = await readSceneFile(file);
      editor.importFile(name, text);
    }
  };

  // With no files yet the app opens on the new-file picker.
  const empty = editor.loaded && !editor.current;

  return (
    <div className={`app${chrome ? '' : ' is-bare'}`}
      onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDropping(true); } }}
      onDragLeave={e => { if (e.currentTarget === e.target || !e.relatedTarget) setDropping(false); }}
      onDrop={e => { if (e.dataTransfer.files.length) { e.preventDefault(); setDropping(false); open(e.dataTransfer.files); } }}>
      <aside className="panel left">
        <FileHeader editor={editor} dark={dark} onDark={() => setDark(d => !d)}
          onNew={() => setDialog('new')} onSeries={() => setDialog('series')} onAgent={() => setDialog('agent')}
          onShortcuts={() => setDialog('shortcuts')} onImport={() => picker.current?.click()} onDelete={() => setDialog('delete')} />
        {scene && <div className="panel-title">
          <h3>Слои</h3>
          <button className="icon" aria-label="Порядок по глубине" data-tip="Порядок по глубине" onClick={editor.autoOrder}><ArrowDownUp size={13} /></button>
        </div>}
        <LayersPanel editor={editor} />
      </aside>

      <main className="stage">
        <Canvas editor={editor} />
        {scene && <Toolbar editor={editor} />}
        {editor.message && <div className="toast" role="status" onClick={() => editor.setMessage(null)}>{editor.message}</div>}
        {dropping && <div className="drop"><FileUp size={20} /> JSON</div>}
      </main>

      <PropertiesPanel editor={editor} dark={dark} />

      <input ref={picker} type="file" accept=".json,application/json" multiple hidden
        onChange={e => { open(e.target.files); e.target.value = ''; }} />
      {(dialog === 'new' || (empty && !dialog)) &&
        <NewFileDialog editor={editor} onClose={empty ? undefined : () => setDialog(null)} onAgent={() => setDialog('agent')} />}
      {dialog === 'series' && <SeriesDialog editor={editor} onClose={() => setDialog(null)} />}
      {dialog === 'agent' && <AgentDialog editor={editor} onClose={() => setDialog(null)} />}
      {dialog === 'shortcuts' && <ShortcutsDialog onClose={() => setDialog(null)} />}
      {dialog === 'delete' && <ConfirmDialog title={`Удалить ${editor.current}?`} action="Удалить"
        onConfirm={editor.deleteFile} onClose={() => setDialog(null)} />}
      <Tooltip />
    </div>
  );
}

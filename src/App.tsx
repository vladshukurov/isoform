import { useEffect, useRef, useState } from 'react';
import { ArrowDownUp, FileUp, X } from 'lucide-react';
import { parse as parseBlocks, serialize } from './clipboard';
import { readSceneFile } from './download';
import { useEditor } from './editor';
import { Canvas } from './ui/Canvas';
import { AgentDialog, ConfirmDialog, NewFileDialog, SeriesDialog, ShortcutsDialog } from './ui/Dialogs';
import { FileHeader } from './ui/FileHeader';
import { LayersPanel } from './ui/LayersPanel';
import { PanelResizer } from './ui/PanelResizer';
import { PropertiesPanel } from './ui/PropertiesPanel';
import { Tooltip } from './ui/Tooltip';

type Dialog = 'new' | 'series' | 'agent' | 'shortcuts' | 'delete' | null;
const typing = (target: EventTarget | null) => !!(target as HTMLElement | null)?.closest?.('input, textarea, select');
const plural = (n: number) => n % 10 === 1 && n % 100 !== 11 ? 'блок' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'блока' : 'блоков';
const readWidths = () => {
  try { const v = JSON.parse(localStorage.getItem('isoform-panels') ?? ''); if (Number.isFinite(v?.left) && Number.isFinite(v?.right)) return v as { left: number; right: number }; } catch { /* first run */ }
  return { left: 240, right: 240 };
};
const readTheme = () => { try { return localStorage.getItem('isoform-theme') === 'dark'; } catch { return false; } };

export function App() {
  const editor = useEditor();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dark, setDark] = useState(readTheme);
  const [chrome, setChrome] = useState(true);
  const [widths, setWidths] = useState(readWidths);
  useEffect(() => { try { localStorage.setItem('isoform-panels', JSON.stringify(widths)); } catch { /* private mode */ } }, [widths]);
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
      // Menus handle their own keys; the empty-state picker counts as a dialog.
      if (typing(e.target) || dialog || empty || document.querySelector('.menu')) return;
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
      if (key === 'v' && !e.shiftKey) editor.setTool('move');
      if (key === 'h' && !e.shiftKey) editor.setTool('hand');
      if (key === 'b' && !e.shiftKey) editor.setTool('block');
      if (key === 'p' && !e.shiftKey) editor.setTool('plate');
      if (e.shiftKey && key === 'h') { editor.mirror('x'); return; }
      if (e.shiftKey && key === 'v') { editor.mirror('y'); return; }
      if (e.shiftKey && key === 'r') { editor.rotate(); return; }
      if (key === 'g' && !e.shiftKey) { editor.drop(); return; }
      if (e.key === 'Enter' && selection.length === 1) { e.preventDefault(); editor.setRenaming(selection[0]); return; }
      // Tab walks the layers front to back, Shift+Tab back.
      const layers = [...scene?.objects ?? []].reverse().filter(p => !p.hidden);
      if (e.key === 'Tab' && layers.length) {
        e.preventDefault();
        const list = layers;
        const at = list.findIndex(p => p.id === selection.at(-1));
        const next = list[(at + (e.shiftKey ? -1 : 1) + list.length) % list.length] ?? list[0];
        editor.setSelection([next.id]);
        return;
      }
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

  // The notice about an outside change stays a few seconds, for the open file only.
  const external = editor.external?.name === editor.current || editor.external?.created ? editor.external : null;
  useEffect(() => {
    if (!editor.external) return;
    const timer = setTimeout(editor.dismissExternal, 8000);
    return () => clearTimeout(timer);
  }, [editor.external]);

  // With no files yet the app opens on the new-file picker.
  const empty = editor.loaded && !editor.current;

  return (
    <div className={`app${chrome ? '' : ' is-bare'}`} style={chrome ? { gridTemplateColumns: `${widths.left}px 1fr ${widths.right}px` } : undefined}
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
        <PanelResizer side="left" width={widths.left} onWidth={left => setWidths(w => ({ ...w, left }))} />
      </aside>

      <main className="stage">
        <Canvas editor={editor} />
        {editor.message && <div className="toast" role="status" onClick={() => editor.setMessage(null)}>{editor.message}</div>}
        {external && <div className="toast toast-action" role="status">
          {external.created
            ? <><span>Новый файл {external.name}</span>
                <button onClick={() => { editor.openFile(external.name); editor.dismissExternal(); }}>Открыть</button></>
            : <><span>Файл изменён снаружи{external.ids.length ? ` · ${external.ids.length} ${plural(external.ids.length)}` : ''}</span>
                <button onClick={() => { editor.undo(); editor.dismissExternal(); }}>Отменить</button></>}
          <button className="icon" aria-label="Закрыть" onClick={editor.dismissExternal}><X size={12} /></button>
        </div>}
        {dropping && <div className="drop"><FileUp size={20} /> JSON</div>}
      </main>

      <PropertiesPanel editor={editor} dark={dark}
        resizer={<PanelResizer side="right" width={widths.right} onWidth={right => setWidths(w => ({ ...w, right }))} />} />

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

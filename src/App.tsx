import { useEffect, useState } from 'react';
import { Canvas } from './Canvas';
import { CardPreview } from './CardPreview';
import { useEditor } from './editor';
import { Inspector } from './Inspector';
import { Layers } from './Layers';
import { Series } from './Series';

const typing = (e: KeyboardEvent) => !!(e.target as HTMLElement).closest('input, textarea, select');

export function App() {
  const editor = useEditor();
  const [view, setView] = useState<'scene' | 'series'>('scene');
  const [dark, setDark] = useState(false);
  const [newName, setNewName] = useState('');
  const { scene, selection, mode } = editor;

  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, [dark]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e) || view !== 'scene') return;
      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? editor.redo() : editor.undo(); return; }
      if (cmd && e.key.toLowerCase() === 'd') { e.preventDefault(); editor.duplicate(); return; }
      if (cmd && e.key.toLowerCase() === 'a') { e.preventDefault(); editor.setSelection(scene?.objects.map(p => p.id) ?? []); return; }
      if (cmd) return;
      if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); editor.remove(); }
      if (e.key === 'Escape') editor.setSelection([]);
      if (e.key === 'b') editor.add('block');
      if (e.key === 'p') editor.add('plate');
      if (e.key === '1') editor.setMode('rest');
      if (e.key === '2') editor.setMode('hover');
      if (e.key === ']') editor.reorder(1);
      if (e.key === '[') editor.reorder(-1);
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

  const create = (copy: boolean) => {
    const name = newName.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) return editor.setMessage('Имя файла: латиница, цифры и дефис, например vault');
    if (editor.scenes[name]) return editor.setMessage(`Сцена ${name} уже есть`);
    editor.createScene(name, copy ? scene : undefined);
    setNewName('');
    setView('scene');
  };

  return (
    <div className="app">
      <header className="toolbar">
        <strong className="brand">Isoform</strong>
        <div className="segmented">
          <button aria-pressed={view === 'scene'} onClick={() => setView('scene')}>Сцена</button>
          <button aria-pressed={view === 'series'} onClick={() => setView('series')}>Серия</button>
        </div>
        {view === 'scene' && scene && <>
          <div className="segmented" title="1 / 2">
            <button aria-pressed={mode === 'rest'} onClick={() => editor.setMode('rest')}>Покой</button>
            <button aria-pressed={mode === 'hover'} onClick={() => editor.setMode('hover')}>Наведение</button>
          </div>
          <div className="group">
            <button onClick={() => editor.add('block')} title="B">+ Блок</button>
            <button onClick={() => editor.add('plate')} title="P — плита толщиной 8; с выделением ложится сверху с зазором">+ Плита</button>
            <button onClick={editor.duplicate} disabled={!selection.length} title="⌘D">Дублировать</button>
            <button onClick={editor.remove} disabled={!selection.length} title="⌫">Удалить</button>
          </div>
          <div className="group">
            <button onClick={editor.undo} title="⌘Z">↶</button>
            <button onClick={editor.redo} title="⇧⌘Z">↷</button>
          </div>
        </>}
        <span className="spacer" />
        <span className={`save save-${editor.save}`}>{{ saved: 'Сохранено', saving: 'Сохраняю…', error: 'Не сохранено' }[editor.save]}</span>
        <button onClick={() => setDark(d => !d)}>{dark ? 'Светлая' : 'Тёмная'}</button>
        {view === 'scene' && scene && <button className="primary" onClick={editor.publish} title={editor.siteArtDir}>Выгрузить на сайт</button>}
      </header>

      <aside className="scenes">
        <h2>Сцены</h2>
        <ul>
          {Object.entries(editor.scenes).map(([name, s]) => (
            <li key={name}>
              <button aria-current={name === editor.current && view === 'scene'} onClick={() => { editor.open(name); setView('scene'); }}>
                <b>{name}</b><span>{s.title}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="new-scene">
          <input placeholder="имя-файла" value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && create(false)} />
          <div className="row">
            <button onClick={() => create(false)}>Новая</button>
            <button onClick={() => create(true)} disabled={!scene}>Копия текущей</button>
          </div>
        </div>
      </aside>

      <main className="stage">
        {view === 'series' ? <Series editor={editor} onOpen={name => { editor.open(name); setView('scene'); }} /> : <Canvas editor={editor} />}
        {editor.message && <div className="toast" onClick={() => editor.setMessage(null)}>{editor.message}</div>}
      </main>

      {view === 'scene' && scene && (
        <aside className="panel">
          <section>
            <h2>Карточка на сайте <small>наведите</small></h2>
            <CardPreview scene={scene} />
          </section>
          <Inspector editor={editor} />
          <Layers editor={editor} />
        </aside>
      )}
    </div>
  );
}

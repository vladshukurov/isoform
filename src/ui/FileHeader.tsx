import { useEffect, useState } from 'react';
import { Boxes, ChevronDown, Download, Moon, Sun } from 'lucide-react';
import { downloadJson, downloadPng, downloadSvg } from '../download';
import type { Editor } from '../editor';
import { Menu, type MenuItem } from './Menu';

type Props = {
  editor: Editor;
  dark: boolean;
  onDark: () => void;
  onNew: () => void;
  onSeries: () => void;
  onAgent: () => void;
  onShortcuts: () => void;
  onImport: () => void;
  onDelete: () => void;
};
const plural = (n: number) => n % 10 === 1 && n % 100 !== 11 ? 'блок' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'блока' : 'блоков';
const VERB: Record<string, string> = { write_scene: 'пишет сцену', update_blocks: 'правит блоки', render_preview: 'смотрит превью', check_scene: 'проверяет', read_scene: 'читает', get_editor_state: 'смотрит выделенное' };

// Top left: the file, as a pill that opens the main menu (double-click the
// name to rename).
export function FileHeader({ editor, dark, onDark, onNew, onSeries, onAgent, onShortcuts, onImport, onDelete }: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const { current, scene } = editor;

  const items: MenuItem[] = [
    ...(Object.keys(editor.files).length ? [{ heading: 'Файлы' }] : []),
    ...Object.keys(editor.files).map(name => ({ label: name, checked: name === current, onSelect: () => editor.openFile(name) })),
    ...(Object.keys(editor.files).length ? ['separator' as const] : []),
    { label: 'Новый файл…', onSelect: onNew },
    { label: 'Открыть JSON…', shortcut: '⌘O', onSelect: onImport },
    { label: 'Дублировать', disabled: !current, onSelect: editor.duplicateFile },
    { label: 'Переименовать', disabled: !current, onSelect: () => setRenaming(true) },
    { label: 'Удалить', danger: true, disabled: !current, onSelect: onDelete },
    'separator',
    { label: 'Серия', onSelect: onSeries },
    { label: 'Подключить агентов…', onSelect: onAgent },
    { label: 'Горячие клавиши', shortcut: '?', onSelect: onShortcuts },
    'separator',
    { label: 'Тёмная тема', checked: dark, onSelect: onDark },
  ];

  return (<>
    <div className="file-pill surface" onClick={e => {
      if (renaming) return;
      const r = e.currentTarget.getBoundingClientRect();
      setMenu({ x: r.left, y: r.bottom + 6 });
    }}>
      <span className="logo"><Boxes size={16} /></span>
      {renaming && current
        ? <input className="file-name" autoFocus defaultValue={current} onClick={e => e.stopPropagation()}
            onBlur={async e => { await editor.renameFile(e.target.value.trim().toLowerCase()); setRenaming(false); }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(false); }} />
        : <span className="file-name" onDoubleClick={e => { e.stopPropagation(); if (current) setRenaming(true); }}>{current ?? 'Isoform'}</span>}
      {scene && !renaming && <span className="file-count">{scene.objects.length} {plural(scene.objects.length)}</span>}
      {editor.save === 'error' && <span className="save-error" data-tip={editor.saveError ?? ''}>Не сохранено</span>}
      {editor.local && <span className="local-badge" data-tip="Файлы хранятся в этом браузере">Браузер</span>}
      <ChevronDown size={14} className="file-chevron" />
    </div>
    {menu && <Menu {...menu} items={items} onClose={() => setMenu(null)} />}
  </>);
}

// Top right: who else is working here, the theme, and download.
export function TopActions({ editor, dark, onDark, onAgent }: { editor: Editor; dark: boolean; onDark: () => void; onAgent: () => void }) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [, tick] = useState(0);
  const a = editor.agent, recent = !!a && Date.now() - a.at < 5000;
  useEffect(() => { if (!recent) return; const t = setTimeout(() => tick(n => n + 1), 5200); return () => clearTimeout(t); }, [a, recent]);
  const { current, scene } = editor;
  const running = !!editor.job?.running;
  const live = running || recent;
  const status = running ? 'собирает' : recent ? `${VERB[a!.tool] ?? a!.tool}` : a ? 'на связи' : null;

  return (
    <div className="top-actions">
      <button className={`presence surface${live ? ' is-live' : ''}`} onClick={onAgent} data-tip={a || running ? 'Агенты' : 'Подключить Claude, Codex, Cursor'}>
        <span className="avatar">C</span>
        {status ? <><span className="presence-dot" /><span className="presence-name">Claude</span><span className="presence-status">{status}</span></>
          : <span className="presence-name">Агенты</span>}
      </button>
      <button className="round surface" aria-label={dark ? 'Светлая тема' : 'Тёмная тема'} data-tip={dark ? 'Светлая тема' : 'Тёмная тема'} onClick={onDark}>
        {dark ? <Sun size={16} /> : <Moon size={16} />}
      </button>
      <button className="primary" disabled={!scene || !current} onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.right - 220, y: r.bottom + 6 }); }}>
        <Download size={16} />Скачать
      </button>
      {menu && scene && current && <Menu {...menu} onClose={() => setMenu(null)} items={[
        { label: 'SVG для сайта', onSelect: () => downloadSvg(current, scene) },
        { label: `PNG 2× · ${dark ? 'тёмная' : 'светлая'}`, onSelect: () => downloadPng(current, scene, dark ? 'dark' : 'light') },
        { label: 'JSON — исходник', onSelect: () => downloadJson(current, scene) },
      ]} />}
    </div>
  );
}

import { useState } from 'react';
import { ChevronDown, CloudAlert, Download, Moon, Sun } from 'lucide-react';
import { downloadJson, downloadPng, downloadSvg } from '../download';
import type { Editor } from '../editor';
import { Mark } from './Glyph';
import { Button, Chip, Dot, IconButton } from './kit';
import { Menu, type MenuItem } from './Menu';

type Props = {
  editor: Editor;
  dark: boolean;
  onDark: () => void;
  onWelcome: () => void;
  onFiles: () => void;
  onShortcuts: () => void;
  onImport: () => void;
  onDelete: () => void;
};

// Top left: the file, as a pill that opens the main menu (double-click the
// name to rename).
export function FileHeader({ editor, dark, onDark, onWelcome, onFiles, onShortcuts, onImport, onDelete }: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const { current } = editor;

  const items: MenuItem[] = [
    ...(Object.keys(editor.files).length ? [{ heading: 'Файлы' }] : []),
    ...Object.keys(editor.files).map(name => ({ label: name, checked: name === current, onSelect: () => editor.openFile(name) })),
    { label: 'Все файлы и серия…', onSelect: onFiles },
    'separator',
    { label: 'Новый файл', onSelect: () => editor.createFile() },
    { label: 'Открыть JSON…', shortcut: '⌘O', onSelect: onImport },
    { label: 'Дублировать', disabled: !current, onSelect: editor.duplicateFile },
    { label: 'Переименовать', disabled: !current, onSelect: () => setRenaming(true) },
    { label: 'Удалить', danger: true, disabled: !current, onSelect: onDelete },
    'separator',
    { label: 'Начало работы', onSelect: onWelcome },
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
      <span className="logo"><Mark size={20} /></span>
      {renaming && current
        ? <input className="file-name" autoFocus defaultValue={current} onClick={e => e.stopPropagation()}
            onBlur={async e => { await editor.renameFile(e.target.value.trim().toLowerCase()); setRenaming(false); }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(false); }} />
        : <span className="file-name" onDoubleClick={e => { e.stopPropagation(); if (current) setRenaming(true); }}>{current ?? 'Isoform'}</span>}
      {editor.save === 'error' && <span className="save-state is-error" role="alert" data-tip={`${editor.saveError ?? 'Ошибка'} — пробуем снова`}><CloudAlert size={14} />Не сохранено</span>}
      {editor.save === 'saving' && <span className="save-state" aria-label="Сохраняется" data-tip="Сохраняется"><Dot tone="muted" live /></span>}
      {editor.browserOnly && <span data-tip="Файлы хранятся в этом браузере"><Chip>Браузер</Chip></span>}
      <ChevronDown size={14} className="file-chevron" />
    </div>
    {menu && <Menu {...menu} items={items} onClose={() => setMenu(null)} />}
  </>);
}

// Top right: the theme and download.
export function TopActions({ editor, dark, onDark }: { editor: Editor; dark: boolean; onDark: () => void }) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const { current, scene } = editor;
  return (
    <div className="top-actions">
      <IconButton size="lg" variant="glass" label={dark ? 'Светлая тема' : 'Тёмная тема'} onClick={onDark}>
        {dark ? <Sun size={16} /> : <Moon size={16} />}
      </IconButton>
      <Button variant="primary" size="lg" icon={<Download size={16} />} disabled={!scene || !current}
        onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.right - 220, y: r.bottom + 6 }); }}>Скачать</Button>
      {menu && scene && current && <Menu {...menu} onClose={() => setMenu(null)} items={[
        { label: 'SVG для сайта', onSelect: () => downloadSvg(current, scene) },
        { label: `PNG 2× · ${dark ? 'тёмная' : 'светлая'}`, onSelect: () => downloadPng(current, scene, dark ? 'dark' : 'light') },
        { label: 'JSON — исходник', onSelect: () => downloadJson(current, scene) },
      ]} />}
    </div>
  );
}

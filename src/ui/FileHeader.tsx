import { useState } from 'react';
import { Boxes, ChevronDown } from 'lucide-react';
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
};

// Top of the left panel: the file name (double-click renames) and the main menu.
export function FileHeader({ editor, dark, onDark, onNew, onSeries, onAgent, onShortcuts }: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const { current } = editor;

  const items: MenuItem[] = [
    ...Object.keys(editor.files).map(name => ({ label: name, checked: name === current, onSelect: () => editor.openFile(name) })),
    ...(Object.keys(editor.files).length ? ['separator' as const] : []),
    { label: 'Новый файл…', onSelect: onNew },
    { label: 'Дублировать', disabled: !current, onSelect: editor.duplicateFile },
    { label: 'Переименовать', disabled: !current, onSelect: () => setRenaming(true) },
    { label: 'Удалить', danger: true, disabled: !current, onSelect: () => { if (confirm(`Удалить ${current}?`)) editor.deleteFile(); } },
    'separator',
    { label: 'Серия', onSelect: onSeries },
    { label: 'С Claude или Codex', onSelect: onAgent },
    { label: 'Горячие клавиши', shortcut: '?', onSelect: onShortcuts },
    'separator',
    { label: 'Тёмная тема', checked: dark, onSelect: onDark },
  ];

  return (
    <div className="file-header">
      <button className="logo" aria-label="Меню" onClick={e => {
        const r = e.currentTarget.getBoundingClientRect();
        setMenu({ x: r.left, y: r.bottom + 4 });
      }}>
        <Boxes size={16} />
        <ChevronDown size={12} />
      </button>
      {renaming && current
        ? <input className="file-name" autoFocus defaultValue={current}
            onBlur={async e => { await editor.renameFile(e.target.value.trim().toLowerCase()); setRenaming(false); }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(false); }} />
        : <span className="file-name" onDoubleClick={() => current && setRenaming(true)} title="Двойной клик — переименовать">{current ?? 'Isoform'}</span>}
      {editor.save === 'error' && <span className="save-error" title={editor.message ?? ''}>Не сохранено</span>}
      {menu && <Menu {...menu} items={items} onClose={() => setMenu(null)} />}
    </div>
  );
}

import type { Editor } from '../editor';
import type { MenuItem } from './Menu';

// The block actions both the canvas and the layers panel offer on right click.
export function pieceMenu(editor: Editor): MenuItem[] {
  const { selected, selection } = editor;
  const hidden = selected.every(p => p.hidden), locked = selected.every(p => p.locked);
  const animated = selected.some(p => p.hover);
  return [
    { label: 'Дублировать', shortcut: '⌘D', onSelect: editor.duplicate },
    { label: 'Удалить', shortcut: '⌫', onSelect: editor.remove },
    'separator',
    { label: 'На передний план', shortcut: '⇧]', onSelect: () => editor.toEdge(true) },
    { label: 'Вперёд', shortcut: ']', onSelect: () => editor.reorder(1) },
    { label: 'Назад', shortcut: '[', onSelect: () => editor.reorder(-1) },
    { label: 'На задний план', shortcut: '⇧[', onSelect: () => editor.toEdge(false) },
    'separator',
    { label: hidden ? 'Показать' : 'Скрыть', shortcut: '⇧⌘H', onSelect: () => editor.toggle(selection, 'hidden') },
    { label: locked ? 'Разблокировать' : 'Заблокировать', shortcut: '⇧⌘L', onSelect: () => editor.toggle(selection, 'locked') },
    ...(animated ? ['separator' as const, {
      label: 'Убрать наведение',
      onSelect: () => editor.change(s => ({ ...s, objects: s.objects.map(p => selection.includes(p.id) ? { ...p, hover: undefined, delay: undefined } : p) })),
    }] : []),
  ];
}

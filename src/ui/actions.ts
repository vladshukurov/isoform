import type { Editor } from '../editor';
import { hoverKind } from '../model';
import type { MenuItem } from './Menu';

// The block actions both the canvas and the layers panel offer on right
// click, bound to the blocks the menu was opened for.
export function pieceMenu(editor: Editor, ids: string[]): MenuItem[] {
  const pieces = editor.scene?.objects.filter(p => ids.includes(p.id)) ?? [];
  const hidden = pieces.every(p => p.hidden), locked = pieces.every(p => p.locked);
  return [
    { label: 'Копировать', shortcut: '⌘C', onSelect: () => editor.copy(ids) },
    { label: 'Вырезать', shortcut: '⌘X', onSelect: () => editor.cut(ids) },
    { label: 'Дублировать', shortcut: '⌘D', onSelect: () => editor.duplicate(ids) },
    { label: 'Удалить', shortcut: '⌫', danger: true, onSelect: () => editor.remove(ids) },
    'separator',
    { label: 'Отразить по X', shortcut: '⇧H', onSelect: () => editor.mirror('x', ids) },
    { label: 'Отразить по Y', shortcut: '⇧V', onSelect: () => editor.mirror('y', ids) },
    { label: 'Повернуть на 90°', shortcut: '⇧R', onSelect: () => editor.rotate(ids) },
    { label: 'На опору', shortcut: 'G', onSelect: () => editor.drop(ids) },
    ...(ids.length > 1 ? [{ label: `Размер как у ${ids.at(-1)}`, onSelect: () => editor.matchSize(undefined, ids) }] : []),
    'separator',
    ...(ids.length > 1 ? [{ label: 'Сгруппировать', shortcut: '⌘G', onSelect: () => editor.group(ids) }] : []),
    ...(pieces.some(p => p.group) ? [{ label: 'Разгруппировать', shortcut: '⇧⌘G', onSelect: () => editor.ungroup(ids) }] : []),
    ...(ids.length > 1 || pieces.some(p => p.group) ? ['separator' as const] : []),
    { label: 'На передний план', shortcut: '⇧]', onSelect: () => editor.toEdge(true, ids) },
    { label: 'Вперёд', shortcut: ']', onSelect: () => editor.reorder(1, ids) },
    { label: 'Назад', shortcut: '[', onSelect: () => editor.reorder(-1, ids) },
    { label: 'На задний план', shortcut: '⇧[', onSelect: () => editor.toEdge(false, ids) },
    'separator',
    { label: hidden ? 'Показать' : 'Скрыть', shortcut: '⇧⌘H', onSelect: () => editor.toggle(ids, 'hidden') },
    { label: locked ? 'Разблокировать' : 'Заблокировать', shortcut: '⇧⌘L', onSelect: () => editor.toggle(ids, 'locked') },
    ...(pieces.some(p => hoverKind(p) !== 'rest') ? ['separator' as const, { label: 'Убрать наведение', onSelect: () => editor.clearHover(ids) }] : []),
  ];
}

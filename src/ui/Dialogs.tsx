import { useEffect, useState, type ReactNode } from 'react';
import { Box, Plus, X } from 'lucide-react';
import { ClaudeMark } from './ClaudeMark';
import { CardPreview } from '../CardPreview';
import type { Editor } from '../editor';
import type { Scene } from '../model';
import { Button, IconButton, Kbd } from './kit';

export function Dialog({ title, onClose, children, wide }: { title: string; onClose?: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div className="backdrop" onPointerDown={e => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`dialog${wide ? ' is-wide' : ''}`} role="dialog" aria-label={title}>
        <header>
          <h2>{title}</h2>
          {onClose && <IconButton label="Закрыть" tip={false} onClick={onClose}><X size={14} /></IconButton>}
        </header>
        {children}
      </div>
    </div>
  );
}

// All files in one place, as the site shows them: yours first, then the
// series (a template opens as a copy). New files start here too.
export function Gallery({ editor, onClose, onClaude }: { editor: Editor; onClose: () => void; onClaude: () => void }) {
  const [hold, setHold] = useState(false);
  const open = (name: string) => { editor.openFile(name); onClose(); };
  const create = (template?: string) => { editor.createFile(template); onClose(); };
  const art = (scene: Scene) => scene.objects.length ? <CardPreview scene={scene} hold={hold} /> : <div className="tile-blank"><Box size={20} /></div>;
  return (
    <Dialog title="Файлы" onClose={onClose} wide>
      <label className="check"><input type="checkbox" checked={hold} onChange={e => setHold(e.target.checked)} /> Всё в наведении</label>
      <h3 className="tiles-heading">Мои</h3>
      <div className="tiles">
        <button className="tile" onClick={onClaude}>
          <div className="tile-art tile-blank tile-agent"><ClaudeMark size={22} /></div>
          <span>Собрать с Claude</span>
        </button>
        <button className="tile" onClick={() => create()}>
          <div className="tile-art tile-blank"><Plus size={20} /></div>
          <span>Пустой</span>
        </button>
        {Object.entries(editor.files).map(([name, scene]) => (
          <button key={name} className={`tile${name === editor.current ? ' is-current' : ''}`} onClick={() => open(name)}>
            <div className="tile-art">{art(scene)}</div>
            <span>{name}</span>
          </button>
        ))}
      </div>
      <h3 className="tiles-heading">Серия сайта · откроется копией</h3>
      <div className="tiles">
        {Object.entries(editor.templates).map(([name, scene]) => (
          <button key={name} className="tile" onClick={() => create(name)}>
            <div className="tile-art">{art(scene)}</div>
            <span>{scene.title}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}

const KEYS: [string, [string, string][]][] = [
  ['Инструменты', [['V', 'Выбор'], ['H · Пробел', 'Рука'], ['B', 'Блок'], ['P', 'Плита']]],
  ['Холст', [['Alt + тащить', 'По высоте'], ['Shift', 'Шаг 10'], ['⌘', 'Без привязки к соседям'], ['Alt + ручка', 'Размер от центра'],
    ['⇧1', 'Вписать'], ['⇧2', 'Показать выделенное'], ['⌘ + колесо', 'Масштаб'], ['⌘\\', 'Скрыть панели']]],
  ['Блоки', [['← → ↑ ↓', 'Сдвиг по X / Y'], ['Alt ↑ ↓', 'Сдвиг по высоте'], ['⌘C · ⌘X · ⌘V', 'Копировать / вырезать / вставить'],
    ['⌘D', 'Дублировать'], ['⌫', 'Удалить'], ['⇧H · ⇧V', 'Отразить по X / Y'], ['⇧R', 'Повернуть на 90°'], ['G', 'На опору'],
    ['[ ]', 'Назад / вперёд'], ['⇧[ ⇧]', 'Назад / вперёд до конца'], ['⇧⌘H', 'Скрыть'], ['⇧⌘L', 'Заблокировать']]],
  ['Слои и файл', [['Tab · ⇧Tab', 'Следующий / предыдущий слой'], ['Enter', 'Переименовать'], ['1 · 2', 'Дизайн / наведение'],
    ['⌘O', 'Открыть JSON'], ['⌘Z · ⇧⌘Z', 'Отменить / вернуть']]],
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Горячие клавиши" onClose={onClose} wide>
      <div className="keys">
        {KEYS.map(([group, keys]) => (
          <dl key={group}>
            <h3>{group}</h3>
            {keys.map(([k, v]) => <div key={k}><dt>{v}</dt><dd><Kbd>{k}</Kbd></dd></div>)}
          </dl>
        ))}
      </div>
    </Dialog>
  );
}

// Our own confirm, in place of the browser's: what will happen, then the choice.
export function ConfirmDialog({ title, text, action, onConfirm, onClose }: { title: string; text?: ReactNode; action: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <Dialog title={title} onClose={onClose}>
      {text && <div className="dialog-body"><p>{text}</p></div>}
      <div className="dialog-actions">
        <Button variant="quiet" onClick={onClose}>Отмена</Button>
        <Button variant="danger" autoFocus onClick={() => { onClose(); onConfirm(); }}>{action}</Button>
      </div>
    </Dialog>
  );
}

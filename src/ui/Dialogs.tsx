import { useEffect, useState, type ReactNode } from 'react';
import { Box, Check, Copy, Plus, Sparkles, X } from 'lucide-react';
import { CardPreview } from '../CardPreview';
import type { Editor } from '../editor';
import type { Scene } from '../model';

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
          {onClose && <button className="icon" onClick={onClose} aria-label="Закрыть"><X size={14} /></button>}
        </header>
        {children}
      </div>
    </div>
  );
}

// New file: empty, one of the site's scenes as a template, or with an agent.
export function NewFileDialog({ editor, onClose, onAgent }: { editor: Editor; onClose?: () => void; onAgent: () => void }) {
  const create = (template?: string) => { editor.createFile(template); onClose?.(); };
  return (
    <Dialog title="Новый файл" onClose={onClose} wide>
      <div className="tiles">
        <button className="tile" onClick={() => create()}>
          <div className="tile-art tile-blank"><Plus size={20} /></div>
          <span>Пустой</span>
        </button>
        <button className="tile" onClick={onAgent}>
          <div className="tile-art tile-blank tile-agent"><Sparkles size={20} /></div>
          <span>Описать словами</span>
        </button>
        {Object.entries(editor.templates).map(([name, scene]) => (
          <button key={name} className="tile" onClick={() => create(name)}>
            <div className="tile-art"><CardPreview scene={scene} /></div>
            <span>{scene.title}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}

// The whole series next to the open file: equal weight, no look-alikes.
export function SeriesDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [hold, setHold] = useState(false);
  // Your files first (the open one marked), then the site's scenes.
  const tile = (key: string, name: string, scene: Scene, current = false, open?: () => void) => (
    <button key={key} className={`tile${current ? ' is-current' : ''}`} onClick={open} disabled={!open}>
      <div className="tile-art">{scene.objects.length ? <CardPreview scene={scene} hold={hold} /> : <div className="tile-blank"><Box size={20} /></div>}</div>
      <span>{name}</span>
    </button>
  );
  return (
    <Dialog title="Серия" onClose={onClose} wide>
      <label className="check"><input type="checkbox" checked={hold} onChange={e => setHold(e.target.checked)} /> Всё в наведении</label>
      {Object.keys(editor.files).length > 0 && <>
        <h3 className="tiles-heading">Мои</h3>
        <div className="tiles">
          {Object.entries(editor.files).map(([name, scene]) => tile(`f:${name}`, name, scene, name === editor.current, () => { editor.openFile(name); onClose(); }))}
        </div>
      </>}
      <h3 className="tiles-heading">Сайт</h3>
      <div className="tiles">
        {Object.entries(editor.templates).map(([name, scene]) => tile(`t:${name}`, scene.title, scene))}
      </div>
    </Dialog>
  );
}

export function CopyBlock({ text, mono }: { text: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={`copy${mono ? ' is-mono' : ''}`}>
      <pre>{text}</pre>
      <button className="icon" aria-label="Скопировать" data-tip={copied ? 'Скопировано' : 'Скопировать'} onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}>{copied ? <Check size={13} /> : <Copy size={13} />}</button>
    </div>
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
            {keys.map(([k, v]) => <div key={k}><dt>{v}</dt><dd><kbd>{k}</kbd></dd></div>)}
          </dl>
        ))}
      </div>
    </Dialog>
  );
}

// Our own confirm, in place of the browser's.
export function ConfirmDialog({ title, action, onConfirm, onClose }: { title: string; action: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <Dialog title={title} onClose={onClose}>
      <div className="dialog-actions">
        <button className="button" onClick={onClose}>Отмена</button>
        <button className="button is-danger" autoFocus onClick={() => { onClose(); onConfirm(); }}>{action}</button>
      </div>
    </Dialog>
  );
}

import { useEffect, useState, type ReactNode } from 'react';
import { Check, Copy, Plus, Sparkles, X } from 'lucide-react';
import { CardPreview } from '../CardPreview';
import type { Editor } from '../editor';
import type { Scene } from '../model';

function Dialog({ title, onClose, children, wide }: { title: string; onClose?: () => void; children: ReactNode; wide?: boolean }) {
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
          <span>С Claude или Codex</span>
        </button>
        {Object.entries(editor.templates).map(([name, scene]) => (
          <button key={name} className="tile" onClick={() => create(name)} data-tip={scene.title}>
            <div className="tile-art"><CardPreview scene={scene} /></div>
            <span>{name}</span>
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
    <button key={key} className={`tile${current ? ' is-current' : ''}`} data-tip={scene.title} onClick={open} disabled={!open}>
      <div className="tile-art"><CardPreview scene={scene} hold={hold} /></div>
      <span>{name}</span>
    </button>
  );
  return (
    <Dialog title="Серия" onClose={onClose} wide>
      <label className="check"><input type="checkbox" checked={hold} onChange={e => setHold(e.target.checked)} /> Всё в наведении</label>
      <div className="tiles">
        {Object.entries(editor.files).map(([name, scene]) => tile(`f:${name}`, name, scene, name === editor.current, () => { editor.openFile(name); onClose(); }))}
        {Object.entries(editor.templates).map(([name, scene]) => tile(`t:${name}`, `${name} · сайт`, scene))}
      </div>
    </Dialog>
  );
}

function CopyBlock({ text, mono }: { text: string; mono?: boolean }) {
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

// Illustrations don't have to be assembled by hand: an agent in this folder
// knows the format and the series' rules (AGENTS.md) and writes the file.
export function AgentDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const file = editor.current ?? 'vault';
  const create = `Собери новую иллюстрацию для карточки «Хранилище паролей»: сейф с приоткрытой дверцей, при наведении дверца открывается. Сохрани в files/vault.json.`;
  const refine = `Доработай files/${file}.json: сделай конструкцию проще и добавь движение при наведении — верхний слой приподнимается.`;
  if (editor.local) return (
    <Dialog title="С Claude или Codex" onClose={onClose}>
      <div className="steps-plain">
        <p>Агент работает с файлами на компьютере, а эта копия редактора хранит сцены в браузере. Запустите локальную версию:</p>
        <CopyBlock text={'cd isoform\nnpm install\nnpm run dev'} mono />
        <p>Или скачайте JSON сцены, попросите агента поправить его и перетащите файл обратно в окно.</p>
      </div>
    </Dialog>
  );
  return (
    <Dialog title="С Claude или Codex" onClose={onClose}>
      <ol className="steps">
        <li>
          <b>Откройте эту папку</b> в Claude Code или Codex
          <CopyBlock text={editor.root} mono />
        </li>
        <li>
          <b>Опишите иллюстрацию</b> — что изображено и что происходит при наведении. Правила серии агент прочитает в AGENTS.md.
          <CopyBlock text={create} />
        </li>
        <li>
          <b>Файл сразу появится здесь.</b> Доведите руками или попросите поправить:
          <CopyBlock text={refine} />
        </li>
      </ol>
    </Dialog>
  );
}

const KEYS: [string, [string, string][]][] = [
  ['Инструменты', [['V', 'Выбор'], ['H · Пробел', 'Рука'], ['B', 'Блок'], ['P', 'Плита']]],
  ['Холст', [['Alt + тащить', 'По высоте'], ['Shift', 'Шаг 10'], ['⌘', 'Без привязки к соседям'], ['Alt + ручка', 'Размер от центра'],
    ['⇧1', 'Вписать'], ['⇧2', 'Показать выделенное'], ['⌘ + колесо', 'Масштаб'], ['⌘\\', 'Скрыть панели']]],
  ['Блоки', [['← → ↑ ↓', 'Сдвиг по X / Y'], ['Alt ↑ ↓', 'Сдвиг по высоте'], ['⌘C · ⌘X · ⌘V', 'Копировать / вырезать / вставить'],
    ['⌘D', 'Дублировать (повторяет последний сдвиг)'], ['⌫', 'Удалить'], ['⇧H · ⇧V', 'Отразить по X / Y'], ['⇧R', 'Повернуть на 90°'],
    ['[ ]', 'Назад / вперёд'], ['⇧[ ⇧]', 'Назад / вперёд до конца'], ['⇧⌘H', 'Скрыть'], ['⇧⌘L', 'Заблокировать']]],
  ['Слои и файл', [['Tab · ⇧Tab', 'Следующий / предыдущий слой'], ['Enter', 'Переименовать'], ['1 · 2', 'Дизайн / наведение'],
    ['⌘O', 'Открыть JSON'], ['⌘Z · ⇧⌘Z', 'Отменить / вернуть']]],
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Горячие клавиши" onClose={onClose}>
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

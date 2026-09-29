import { useEffect, useState, type ReactNode } from 'react';
import { Check, Copy, Plus, Sparkles, X } from 'lucide-react';
import { CardPreview } from '../CardPreview';
import type { Editor } from '../editor';

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
          <button key={name} className="tile" onClick={() => create(name)} title={scene.title}>
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
  const entries = [...(editor.scene && editor.current ? [[editor.current, editor.scene] as const] : []), ...Object.entries(editor.templates)];
  return (
    <Dialog title="Серия" onClose={onClose} wide>
      <label className="check"><input type="checkbox" checked={hold} onChange={e => setHold(e.target.checked)} /> Всё в наведении</label>
      <div className="tiles">
        {entries.map(([name, scene], i) => (
          <div key={name} className={`tile${i === 0 && editor.scene ? ' is-current' : ''}`} title={scene.title}>
            <div className="tile-art"><CardPreview scene={scene} hold={hold} /></div>
            <span>{name}</span>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

function CopyBlock({ text, mono }: { text: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={`copy${mono ? ' is-mono' : ''}`}>
      <pre>{text}</pre>
      <button className="icon" title="Скопировать" onClick={async () => {
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

const KEYS: [string, string][] = [
  ['V', 'Выбор'], ['H · Пробел', 'Рука'], ['B', 'Блок'], ['P', 'Плита'],
  ['Alt + тащить', 'По высоте'], ['Shift', 'Шаг 10'], ['← → ↑ ↓', 'Сдвиг по X / Y'], ['Alt ↑ ↓', 'Сдвиг по высоте'],
  ['⌘D', 'Дублировать'], ['⌫', 'Удалить'], ['[ ]', 'Назад / вперёд'], ['⇧[ ⇧]', 'Назад / вперёд до конца'],
  ['⇧⌘H', 'Скрыть'], ['⇧⌘L', 'Заблокировать'], ['1 · 2', 'Дизайн / наведение'],
  ['⇧1', 'Вписать'], ['⌘ + колесо', 'Масштаб'], ['⌘Z · ⇧⌘Z', 'Отменить / вернуть'],
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Горячие клавиши" onClose={onClose}>
      <dl className="keys">
        {KEYS.map(([k, v]) => <div key={k}><dt>{v}</dt><dd><kbd>{k}</kbd></dd></div>)}
      </dl>
    </Dialog>
  );
}

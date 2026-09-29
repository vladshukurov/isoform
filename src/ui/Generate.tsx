import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Brain, RefreshCw, ChevronDown, CircleAlert, KeyRound, ListChecks, MessageSquare, PenLine, Square, Terminal, Undo2, X } from 'lucide-react';
import { localAgent } from '../ai/local';
import type { Editor } from '../editor';
import { Menu } from './Menu';

type Engine = 'local' | 'api';
const read = (key: string) => { try { return localStorage.getItem(key) ?? ''; } catch { return ''; } };
const write = (key: string, value: string) => { try { value ? localStorage.setItem(key, value) : localStorage.removeItem(key); } catch { /* private mode */ } };
const KEY = 'isoform:anthropic-key', ENGINE = 'isoform:engine';
const ICON = { think: Brain, draft: PenLine, check: ListChecks, tool: Terminal, text: MessageSquare };

// Describe it, and Claude builds it on the canvas: through Claude Code on
// this computer when the dev server finds it, or with an Anthropic API key
// from the browser, which works anywhere, the static build included.
export function Generate({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [prompt, setPrompt] = useState('');
  const [local, setLocal] = useState<{ available: boolean; loggedIn?: boolean; version?: string } | null>(null);
  const [engine, setEngine] = useState<Engine>(() => (read(ENGINE) as Engine) || 'local');
  const [key, setKey] = useState(() => read(KEY));
  const [keyDraft, setKeyDraft] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const { job, selection, scene } = editor;

  useEffect(() => { if (!editor.local) localAgent().then(setLocal); else setLocal({ available: false }); }, [editor.local]);
  // Without Claude Code here, the key is the only way.
  const chosen: Engine = local && !local.available ? 'api' : engine;
  useEffect(() => { input.current?.focus(); }, []);
  // The field grows with the text, up to a few lines.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [prompt]);

  const needsKey = chosen === 'api' && !key;
  // Installed but not signed in: one step in a terminal.
  const needsLogin = chosen === 'local' && !!local?.available && !local.loggedIn;
  const running = !!job?.running;
  const send = () => {
    const text = prompt.trim();
    if (!text || running || needsKey || needsLogin || (chosen === 'local' && !local?.available)) return;
    editor.generate(text, chosen, key);
    setPrompt('');
  };
  const placeholder = selection.length ? `Что сделать с выделенным (${selection.length})?`
    : scene?.objects.length ? 'Что изменить в сцене?' : 'Что нарисовать? Например: сейф, дверца открывается при наведении';

  return (
    <div className="generate" onKeyDown={e => { if (e.key === 'Escape' && !running) { e.stopPropagation(); onClose(); } }}>
      {job && (
        <div className="generate-log" aria-live="polite">
          {job.steps.map((step, i) => {
            const Icon = ICON[step.kind];
            return <div key={i} className={`generate-step${i === job.steps.length - 1 && job.running ? ' is-live' : ''}`}><Icon size={14} /><span>{step.text}</span></div>;
          })}
          {job.error && <div className="generate-step is-error"><CircleAlert size={14} /><span>{job.error}</span></div>}
          {!job.running && job.result && (
            <div className="generate-result">
              <span>{job.result}</span>
              <button className="icon" aria-label="Отменить" data-tip="Отменить генерацию" onClick={() => { editor.undo(); editor.dismissJob(); }}><Undo2 size={14} /></button>
              <button className="icon" aria-label="Скрыть" onClick={editor.dismissJob}><X size={14} /></button>
            </div>
          )}
        </div>
      )}

      {needsLogin && (
        <div className="generate-login">
          <Terminal size={14} />
          <span>Войдите в Claude Code один раз: в терминале <code>claude</code>, затем <code>/login</code></span>
          <button className="icon" aria-label="Проверить снова" data-tip="Проверить снова" onClick={() => localAgent().then(setLocal)}><RefreshCw size={14} /></button>
        </div>
      )}
      {needsKey ? (
        <form className="generate-key" onSubmit={e => { e.preventDefault(); const k = keyDraft.trim(); if (k) { write(KEY, k); setKey(k); setKeyDraft(''); } }}>
          <KeyRound size={16} />
          <input type="password" autoComplete="off" spellCheck={false} placeholder="Ключ Anthropic API — хранится только в этом браузере"
            value={keyDraft} onChange={e => setKeyDraft(e.target.value)} />
          <button className="button is-primary" disabled={!keyDraft.trim()}>Сохранить</button>
        </form>
      ) : (
        <div className="generate-input">
          <textarea ref={input} rows={1} value={prompt} placeholder={placeholder} disabled={running}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
          {running
            ? <button className="icon generate-send" aria-label="Остановить" data-tip="Остановить" onClick={editor.stopGenerating}><Square size={12} fill="currentColor" /></button>
            : <button className="icon generate-send" aria-label="Отправить" data-tip="Отправить" data-kbd="↵" disabled={!prompt.trim()} onClick={send}><ArrowUp size={16} /></button>}
        </div>
      )}

      <div className="generate-foot">
        <button className="generate-engine" onClick={e => { const r = e.currentTarget.getBoundingClientRect(), bar = e.currentTarget.closest('.generate')!.getBoundingClientRect(); setMenu({ x: r.left, y: bar.top - 6 }); }}>
          {chosen === 'local' ? `Claude Code${local?.version ? ` · ${local.version.split(' ')[0]}` : ''}` : 'Anthropic API'}
          <ChevronDown size={12} />
        </button>
        <button className="icon" aria-label="Закрыть" data-tip="Закрыть" data-kbd="Esc" onClick={onClose} disabled={running}><X size={14} /></button>
      </div>
      {menu && <Menu x={menu.x} y={menu.y} above onClose={() => setMenu(null)} items={[
        { label: local?.available && !local.loggedIn ? 'Claude Code (нужен вход)' : 'Claude Code на этом компьютере', checked: chosen === 'local', disabled: !local?.available, onSelect: () => { setEngine('local'); write(ENGINE, 'local'); } },
        { label: 'Ключ Anthropic API', checked: chosen === 'api', onSelect: () => { setEngine('api'); write(ENGINE, 'api'); } },
        ...(key ? ['separator' as const, { label: 'Забыть ключ', danger: true, onSelect: () => { write(KEY, ''); setKey(''); } }] : []),
      ]} />}
    </div>
  );
}

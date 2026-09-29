import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowUp, Box, Brain, ChevronDown, CircleAlert, Hand, KeyRound, Layers2, ListChecks, MessageSquare, MousePointer2, PenLine, RefreshCw,
  Square, Terminal, Undo2, X,
} from 'lucide-react';
import { localAgent } from '../ai/local';
import type { Editor, Tool } from '../editor';
import { Menu } from './Menu';

type Engine = 'local' | 'api';
const read = (key: string) => { try { return localStorage.getItem(key) ?? ''; } catch { return ''; } };
const write = (key: string, value: string) => { try { value ? localStorage.setItem(key, value) : localStorage.removeItem(key); } catch { /* private mode */ } };
const KEY = 'isoform:anthropic-key', ENGINE = 'isoform:engine';
const ICON = { think: Brain, draft: PenLine, check: ListChecks, tool: Terminal, text: MessageSquare };
const TOOLS: { tool: Tool; Icon: typeof Box; tip: string; kbd: string }[] = [
  { tool: 'move', Icon: MousePointer2, tip: 'Выбор', kbd: 'V' },
  { tool: 'hand', Icon: Hand, tip: 'Рука', kbd: 'H' },
  { tool: 'block', Icon: Box, tip: 'Блок', kbd: 'B' },
  { tool: 'plate', Icon: Layers2, tip: 'Плита', kbd: 'P' },
];
const plural = (n: number) => n % 10 === 1 && n % 100 !== 11 ? 'блок' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'блока' : 'блоков';

// The one bar at the bottom of the canvas: the tools on the left, and the
// prompt to Claude beside them, so building by hand and by words sit
// together. The run's log unfolds above it.
export function Dock({ editor }: { editor: Editor }) {
  const [prompt, setPrompt] = useState('');
  const [local, setLocal] = useState<{ available: boolean; loggedIn?: boolean; version?: string } | null>(null);
  const [engine, setEngine] = useState<Engine>(() => (read(ENGINE) as Engine) || 'local');
  const [key, setKey] = useState(() => read(KEY));
  const [keyDraft, setKeyDraft] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);
  const { job, selection, scene, aiOpen: focused, setAiOpen: setFocused } = editor;

  useEffect(() => { if (!editor.local) localAgent().then(setLocal); else setLocal({ available: false }); }, [editor.local]);
  const chosen: Engine = local && !local.available ? 'api' : engine;
  // ⌘K (aiOpen) puts the caret in the prompt.
  useEffect(() => { if (focused && document.activeElement !== input.current) input.current?.focus(); }, [focused]);
  // The field grows with the text; re-measured as the dock widens too.
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    const fit = () => { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 120)}px`; };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el.parentElement!);
    return () => observer.disconnect();
  }, [prompt]);
  // The active tool's pill slides between the buttons.
  useLayoutEffect(() => {
    const el = toolsRef.current?.querySelector<HTMLElement>(`[data-tool="${editor.tool}"]`);
    if (el) setPill({ x: el.offsetLeft, w: el.offsetWidth });
  }, [editor.tool]);

  const needsKey = chosen === 'api' && !key;
  const needsLogin = chosen === 'local' && !!local?.available && !local.loggedIn;
  const running = !!job?.running;
  const send = () => {
    const text = prompt.trim();
    if (!text || running || needsKey || needsLogin || (chosen === 'local' && !local?.available)) return;
    editor.generate(text, chosen, key);
    setPrompt('');
  };
  const placeholder = selection.length ? 'Что сделать с выделенным?'
    : scene?.objects.length ? 'Что изменить в сцене?' : 'Опишите иллюстрацию — Claude соберёт её';
  const open = focused || !!job;
  const engineLabel = chosen === 'local' ? `Claude Code${local?.version ? ` ${local.version.split(' ')[0]}` : ''}` : 'Anthropic API';

  return (
    <div className={`dock${open ? ' is-open' : ''}${running ? ' is-running' : ''}`}
      onPointerDown={e => e.stopPropagation()} onContextMenu={e => e.stopPropagation()}
      onKeyDown={e => { if (e.key === 'Escape' && !running) { e.stopPropagation(); input.current?.blur(); setFocused(false); } }}>
      <div className="dock-ring" aria-hidden />
      <div className="dock-body">
        {open && (job || needsLogin || needsKey) && (
          <div className="dock-panel">
            {job && (
              <div className="dock-log" aria-live="polite">
                {job.steps.map((step, i) => {
                  const Icon = ICON[step.kind];
                  return <div key={i} className={`dock-step${i === job.steps.length - 1 && job.running ? ' is-live' : ''}`}><Icon size={14} /><span>{step.text}</span></div>;
                })}
                {job.error && <div className="dock-step is-error"><CircleAlert size={14} /><span>{job.error}</span></div>}
                {!job.running && job.result && (
                  <div className="dock-result">
                    <span>{job.result}</span>
                    <button className="icon" aria-label="Отменить" data-tip="Отменить генерацию" onClick={() => { editor.undo(); editor.dismissJob(); }}><Undo2 size={14} /></button>
                    <button className="icon" aria-label="Скрыть" data-tip="Скрыть" onClick={editor.dismissJob}><X size={14} /></button>
                  </div>
                )}
              </div>
            )}
            {needsLogin && (
              <div className="dock-note">
                <Terminal size={14} />
                <span>Войдите в Claude Code один раз: в терминале <code>claude</code>, затем <code>/login</code></span>
                <button className="icon" aria-label="Проверить снова" data-tip="Проверить снова" onClick={() => localAgent().then(setLocal)}><RefreshCw size={14} /></button>
              </div>
            )}
            {needsKey && (
              <form className="dock-note" onSubmit={e => { e.preventDefault(); const k = keyDraft.trim(); if (k) { write(KEY, k); setKey(k); setKeyDraft(''); input.current?.focus(); } }}>
                <KeyRound size={14} />
                <input type="password" autoComplete="off" spellCheck={false} placeholder="Ключ Anthropic API — хранится только в этом браузере"
                  value={keyDraft} onChange={e => setKeyDraft(e.target.value)} onFocus={() => setFocused(true)} />
                <button className="button is-primary" disabled={!keyDraft.trim()}>Сохранить</button>
              </form>
            )}
          </div>
        )}

        <div className="dock-bar">
          <div className="dock-tools" ref={toolsRef}>
            {pill && <i className="dock-pill" style={{ transform: `translateX(${pill.x}px)`, width: pill.w }} />}
            {TOOLS.map(({ tool, Icon, tip, kbd }) => (
              <button key={tool} data-tool={tool} className="dock-tool" aria-pressed={editor.tool === tool} aria-label={tip} data-tip={tip} data-kbd={kbd}
                onClick={() => editor.setTool(tool)}><Icon size={18} /></button>
            ))}
          </div>
          <span className="dock-sep" />
          <div className="dock-input" onClick={() => input.current?.focus()}>
            {selection.length > 0 && <span className="dock-chip" data-tip="Claude видит выделенное">
              <Box size={12} />{selection.length === 1 ? selection[0] : `${selection.length} ${plural(selection.length)}`}
            </span>}
            <textarea ref={input} rows={1} value={prompt} placeholder={placeholder} disabled={running}
              onFocus={() => setFocused(true)}
              onBlur={() => { if (!prompt.trim()) setFocused(false); }}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
            {open
              ? <button className="dock-engine" data-tip="Кто собирает" onMouseDown={e => e.preventDefault()}
                  onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.left, y: r.top - 6 }); }}>
                  {engineLabel}<ChevronDown size={12} />
                </button>
              : <kbd className="dock-kbd">⌘K</kbd>}
            {running
              ? <button className="dock-send is-stop" aria-label="Остановить" data-tip="Остановить" onClick={editor.stopGenerating}><Square size={11} fill="currentColor" /></button>
              : <button className="dock-send" aria-label="Отправить" data-tip="Отправить" data-kbd="↵" disabled={!prompt.trim()}
                  onMouseDown={e => e.preventDefault()} onClick={send}><ArrowUp size={16} strokeWidth={2.4} /></button>}
          </div>
        </div>
      </div>
      {menu && <Menu x={menu.x} y={menu.y} above onClose={() => setMenu(null)} items={[
        { label: local?.available && !local.loggedIn ? 'Claude Code (нужен вход)' : 'Claude Code на этом компьютере', checked: chosen === 'local', disabled: !local?.available, onSelect: () => { setEngine('local'); write(ENGINE, 'local'); } },
        { label: 'Ключ Anthropic API', checked: chosen === 'api', onSelect: () => { setEngine('api'); write(ENGINE, 'api'); } },
        ...(key ? ['separator' as const, { label: 'Забыть ключ', danger: true, onSelect: () => { write(KEY, ''); setKey(''); } }] : []),
      ]} />}
    </div>
  );
}

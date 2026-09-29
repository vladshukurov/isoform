import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowUp, Box, ChevronDown, CornerDownLeft, ExternalLink, Hand, KeyRound, Layers2, LoaderCircle, MousePointer2, RotateCcw, SquarePen, Square, Undo2,
} from 'lucide-react';
import { localAgent, sendLoginCode, startLogin } from '../ai/local';
import type { Editor, Tool } from '../editor';
import { ClaudeMark } from './ClaudeMark';
import { Menu } from './Menu';

type Engine = 'local' | 'api';
type Local = { available: boolean; loggedIn?: boolean; version?: string };
type Login = { phase: 'idle' | 'opening' | 'code' | 'checking'; url?: string; error?: string };
const read = (key: string) => { try { return localStorage.getItem(key) ?? ''; } catch { return ''; } };
const write = (key: string, value: string) => { try { value ? localStorage.setItem(key, value) : localStorage.removeItem(key); } catch { /* private mode */ } };
const KEY = 'isoform:anthropic-key', ENGINE = 'isoform:engine';
const TOOLS: { tool: Tool; Icon: typeof Box; tip: string; kbd: string }[] = [
  { tool: 'move', Icon: MousePointer2, tip: 'Выбор', kbd: 'V' },
  { tool: 'hand', Icon: Hand, tip: 'Рука', kbd: 'H' },
  { tool: 'block', Icon: Box, tip: 'Блок', kbd: 'B' },
  { tool: 'plate', Icon: Layers2, tip: 'Плита', kbd: 'P' },
];
const plural = (n: number) => n % 10 === 1 && n % 100 !== 11 ? 'блок' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'блока' : 'блоков';

// The one bar at the bottom of the canvas: the tools, and a line to Claude
// beside them. Whatever you write goes to Claude with the open file and the
// selection; its edits land on the canvas as it writes them, and follow-ups
// continue the same conversation.
export function Dock({ editor }: { editor: Editor }) {
  const [prompt, setPrompt] = useState('');
  const [local, setLocal] = useState<Local | null>(null);
  const [engine, setEngine] = useState<Engine>(() => (read(ENGINE) as Engine) || 'local');
  const [key, setKey] = useState(() => read(KEY));
  const [keyDraft, setKeyDraft] = useState('');
  const [login, setLogin] = useState<Login>({ phase: 'idle' });
  const [code, setCode] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);
  const { job, selection, scene, thread, aiOpen: focused, setAiOpen: setFocused } = editor;

  const check = () => editor.local ? Promise.resolve(setLocal({ available: false })) : localAgent().then(setLocal);
  useEffect(() => { check(); }, [editor.local]);
  const chosen: Engine = local && !local.available ? 'api' : engine;
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
  useLayoutEffect(() => {
    const el = toolsRef.current?.querySelector<HTMLElement>(`[data-tool="${editor.tool}"]`);
    if (el) setPill({ x: el.offsetLeft, w: el.offsetWidth });
  }, [editor.tool]);
  // The conversation keeps its newest line in view.
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [thread.length, job?.steps.length, job?.running]);

  const needsKey = chosen === 'api' && !key;
  const needsLogin = chosen === 'local' && !!local?.available && !local.loggedIn;
  const ready = chosen === 'api' ? !!key : !!local?.loggedIn;
  const running = !!job?.running;
  const send = () => {
    const text = prompt.trim();
    if (!text || running || !ready) return;
    editor.generate(text, chosen, key);
    setPrompt('');
  };
  const signIn = async () => {
    setLogin({ phase: 'opening' });
    try { const { url } = await startLogin(); setLogin({ phase: 'code', url }); window.open(url, '_blank', 'noopener'); }
    catch (error) { setLogin({ phase: 'idle', error: (error as Error).message }); }
  };
  const submitCode = async () => {
    if (!code.trim()) return;
    setLogin(l => ({ ...l, phase: 'checking', error: undefined }));
    try { await sendLoginCode(code); setCode(''); setLogin({ phase: 'idle' }); await check(); input.current?.focus(); }
    catch (error) { setLogin(l => ({ ...l, phase: 'code', error: (error as Error).message })); }
  };

  const placeholder = !ready ? 'Подключите Claude'
    : selection.length ? 'Что сделать с выделенным?'
    : scene?.objects.length ? (editor.hasSession ? 'Продолжить разговор…' : 'Что изменить в сцене?') : 'Опишите иллюстрацию — Claude соберёт её';
  // The conversation shows while you're in the field, and always while Claude works.
  const talk = thread.length > 0 || !!job;
  const setup = needsLogin || needsKey;
  const panel = (focused && (talk || setup)) || running;
  const open = focused || running;
  const engineLabel = chosen === 'local' ? 'Claude Code' : 'API';
  const last = job && !job.running && thread.at(-1)?.prompt === job.prompt;

  return (
    <div className={`dock${open ? ' is-open' : ''}${running ? ' is-running' : ''}`}
      onPointerDown={e => e.stopPropagation()} onContextMenu={e => e.stopPropagation()}
      onKeyDown={e => { if (e.key === 'Escape' && !running) { e.stopPropagation(); input.current?.blur(); setFocused(false); } }}>
      <div className="dock-body">
        {running && <div className="dock-scan" aria-hidden />}
        {panel && (
          <div className="dock-panel" onMouseDown={e => { if (!(e.target as HTMLElement).closest('input, button, a')) e.preventDefault(); }}>
            {setup && !running ? (
              needsLogin ? (
                <div className="connect">
                  <div className="connect-mark" aria-hidden><ClaudeMark size={20} /></div>
                  {login.phase === 'code' || login.phase === 'checking' ? <>
                    <div className="connect-text">
                      <b>Остался один шаг</b>
                      <span>Подтвердите вход в открывшейся вкладке и вставьте код, который покажет Claude. <a href={login.url} target="_blank" rel="noreferrer">Вкладка не открылась <ExternalLink size={11} /></a></span>
                    </div>
                    <form className="connect-code" onSubmit={e => { e.preventDefault(); submitCode(); }}>
                      <input autoFocus value={code} onChange={e => setCode(e.target.value)} placeholder="Код подтверждения" spellCheck={false} autoComplete="off" onFocus={() => setFocused(true)} />
                      <button className="button is-primary" disabled={!code.trim() || login.phase === 'checking'}>
                        {login.phase === 'checking' ? <LoaderCircle size={14} className="spin" /> : 'Подключить'}
                      </button>
                    </form>
                  </> : <>
                    <div className="connect-text">
                      <b>Собирайте сцены вместе с Claude</b>
                      <span>Опишите идею или правку своими словами — Claude расставит блоки на холсте, и вы увидите каждый шаг. Достаточно войти в свой аккаунт.</span>
                    </div>
                    <button className="button is-primary" onClick={signIn} disabled={login.phase === 'opening'}>
                      {login.phase === 'opening' ? <LoaderCircle size={14} className="spin" /> : 'Войти через Claude'}
                    </button>
                  </>}
                  {login.error && <div className="connect-error">{login.error}</div>}
                </div>
              ) : (
                <form className="connect" onSubmit={e => { e.preventDefault(); const k = keyDraft.trim(); if (k) { write(KEY, k); setKey(k); setKeyDraft(''); input.current?.focus(); } }}>
                  <div className="connect-mark" aria-hidden><KeyRound size={16} /></div>
                  <div className="connect-text">
                    <b>{local?.available === false && !editor.local ? 'Claude Code ещё не установлен' : 'Работа через ключ API'}</b>
                    <span>{local?.available === false && !editor.local
                      ? <>Поставьте его одной командой — <code>npm i -g @anthropic-ai/claude-code</code> — или подключитесь по ключу API.</>
                      : 'Ключ из console.anthropic.com. Он остаётся в этом браузере и уходит только в Anthropic.'}</span>
                  </div>
                  <div className="connect-code">
                    <input type="password" autoComplete="off" spellCheck={false} placeholder="sk-ant-…" value={keyDraft}
                      onChange={e => setKeyDraft(e.target.value)} onFocus={() => setFocused(true)} />
                    <button className="button is-primary" disabled={!keyDraft.trim()}>Сохранить</button>
                  </div>
                </form>
              )
            ) : (
              <>
                <div className="thread-head">
                  <span><ClaudeMark size={13} />{editor.hasSession ? 'Claude помнит этот разговор' : 'Claude'}</span>
                  <button className="icon" aria-label="Новый разговор" data-tip="Новый разговор" disabled={running || !talk}
                    onClick={() => { editor.newConversation(); input.current?.focus(); }}><SquarePen size={14} /></button>
                  <button className="icon" aria-label="Свернуть" onClick={() => { input.current?.blur(); setFocused(false); editor.dismissJob(); }} disabled={running}><ChevronDown size={14} /></button>
                </div>
                <div className="thread" ref={log} aria-live="polite">
                  {thread.slice(0, last ? -1 : undefined).slice(-6).map((t, i) => (
                    <div key={i} className="turn">
                      <p className="turn-you">{t.prompt}</p>
                      {t.error ? <p className="turn-error">{t.error}</p> : <p className="turn-claude">{t.result}</p>}
                    </div>
                  ))}
                  {job && (
                    <div className="turn is-current">
                      <p className="turn-you">{job.prompt}</p>
                      {job.running
                        ? <div className="turn-steps">
                            {job.steps.slice(-3).map((s, i, all) => <p key={i} className={i === all.length - 1 ? 'is-live' : ''}>{s.text}</p>)}
                            {!job.steps.length && <p className="is-live">Читает сцену…</p>}
                          </div>
                        : job.error
                          ? <div className="turn-end"><p className="turn-error">{job.error}</p>
                              <button className="chip-button" onClick={() => editor.generate(job.prompt, chosen, key)}><RotateCcw size={12} />Ещё раз</button></div>
                          : <div className="turn-end"><p className="turn-claude">{job.result}</p>
                              <button className="chip-button" onClick={() => { editor.undo(); editor.dismissJob(); }}><Undo2 size={12} />Отменить</button></div>}
                    </div>
                  )}
                </div>
              </>
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
          <div className={`dock-input${ready ? '' : ' is-off'}`} onClick={() => input.current?.focus()}>
            {selection.length > 0 && <span className="dock-chip">
              <Box size={12} />{selection.length === 1 ? selection[0] : `${selection.length} ${plural(selection.length)}`}
            </span>}
            <textarea ref={input} rows={1} value={prompt} placeholder={placeholder} disabled={running}
              onFocus={() => setFocused(true)}
              onBlur={() => { if (!prompt.trim()) setFocused(false); }}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
            {open && !running && <button className="dock-engine" onMouseDown={e => e.preventDefault()}
              onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.left, y: r.top - 6 }); }}>
              <ClaudeMark size={12} />{engineLabel}<ChevronDown size={12} />
            </button>}
            {!open && <kbd className="dock-kbd">⌘K</kbd>}
            {running
              ? <button className="dock-send is-stop" aria-label="Остановить" data-tip="Остановить" onClick={editor.stopGenerating}><Square size={10} fill="currentColor" /></button>
              : <button className="dock-send" aria-label="Отправить" disabled={!prompt.trim() || !ready}
                  onMouseDown={e => e.preventDefault()} onClick={send}>{prompt.trim() ? <ArrowUp size={16} strokeWidth={2.4} /> : <CornerDownLeft size={14} />}</button>}
          </div>
        </div>
      </div>
      {menu && <Menu x={menu.x} y={menu.y} above onClose={() => setMenu(null)} items={[
        { label: local?.available ? (local.loggedIn ? 'Claude Code — ваш аккаунт' : 'Claude Code — нужен вход') : 'Claude Code не установлен', checked: chosen === 'local', disabled: !local?.available, onSelect: () => { setEngine('local'); write(ENGINE, 'local'); } },
        { label: 'Ключ Anthropic API', checked: chosen === 'api', onSelect: () => { setEngine('api'); write(ENGINE, 'api'); } },
        ...(chosen === 'local' && local?.loggedIn ? ['separator' as const, { label: 'Войти другим аккаунтом', onSelect: () => { setLocal(l => l && { ...l, loggedIn: false }); setFocused(true); signIn(); } }] : []),
        ...(key ? ['separator' as const, { label: 'Забыть ключ', danger: true, onSelect: () => { write(KEY, ''); setKey(''); } }] : []),
      ]} />}
    </div>
  );
}

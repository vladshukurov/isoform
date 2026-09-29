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
// Examples that rotate in the empty field; Tab puts the one shown into it.
const EXAMPLES = {
  empty: [
    'Сейф на плите, дверца приоткрывается при наведении',
    'Стопка карточек доступа, верхняя выезжает вперёд',
    'Сервер с тремя дисками, диски выдвигаются волной',
    'Замок со скобой, скоба поднимается при наведении',
  ],
  scene: [
    'Добавь крышку, которая приподнимается при наведении',
    'Сделай композицию ниже и шире',
    'Пусть детали двигаются волной, от дальних к ближним',
    'Поставь всё на плиту побольше',
  ],
  selection: [
    'Подними на 10 и добавь волну задержек',
    'Сделай вдвое тоньше',
    'Пусть выезжает вперёд при наведении',
    'Повтори три раза с зазором 12',
  ],
};
const plural = (n: number) => n % 10 === 1 && n % 100 !== 11 ? 'блок' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'блока' : 'блоков';

// The one bar at the bottom of the canvas: the tools, and a line to Claude
// beside them. Whatever you write goes to Claude with the open file and the
// selection; its edits land on the canvas as it writes them, and follow-ups
// continue the same conversation. The bar itself never changes shape: the
// conversation unfolds above it.
export function Dock({ editor }: { editor: Editor }) {
  const [prompt, setPrompt] = useState('');
  const [local, setLocal] = useState<Local | null>(null);
  const [engine, setEngine] = useState<Engine>(() => (read(ENGINE) as Engine) || 'local');
  const [key, setKey] = useState(() => read(KEY));
  const [keyDraft, setKeyDraft] = useState('');
  const [login, setLogin] = useState<Login>({ phase: 'idle' });
  const [code, setCode] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [talkMenu, setTalkMenu] = useState<{ x: number; y: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);
  const [tick, setTick] = useState(0);
  const { job, selection, scene, thread, aiOpen: focused, setAiOpen: setFocused } = editor;

  const check = () => editor.local ? Promise.resolve(setLocal({ available: false })) : localAgent().then(setLocal);
  useEffect(() => { check(); }, [editor.local]);
  const chosen: Engine = local && !local.available ? 'api' : engine;
  useEffect(() => { if (focused && !root.current?.contains(document.activeElement)) input.current?.focus(); }, [focused]);
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [prompt]);
  useLayoutEffect(() => {
    const el = toolsRef.current?.querySelector<HTMLElement>(`[data-tool="${editor.tool}"]`);
    if (el) setPill({ x: el.offsetLeft, w: el.offsetWidth });
  }, [editor.tool]);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' }); }, [thread.length, job?.steps.length, job?.running]);

  const needsKey = chosen === 'api' && !key;
  const needsLogin = chosen === 'local' && !!local?.available && !local.loggedIn;
  const ready = chosen === 'api' ? !!key : !!local?.loggedIn;
  const running = !!job?.running;
  const signingIn = login.phase !== 'idle';
  const ask = (text: string) => {
    if (!text.trim() || running || !ready) return;
    editor.generate(text.trim(), chosen, key);
    setPrompt('');
  };
  const send = () => ask(prompt);
  // Ideas elsewhere (the empty canvas) ask Claude through the same line.
  useEffect(() => {
    const onAsk = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      setFocused(true);
      if (ready) ask(text); else { setPrompt(text); input.current?.focus(); }
    };
    window.addEventListener('isoform:ask', onAsk);
    return () => window.removeEventListener('isoform:ask', onAsk);
  });
  // A second hand for the running timer.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  // The CLI opens the browser itself; the link is there if it didn't.
  const signIn = async () => {
    setLogin({ phase: 'opening' });
    try { const { url } = await startLogin(); setLogin({ phase: 'code', url }); }
    catch (error) { setLogin({ phase: 'idle', error: (error as Error).message }); }
  };
  const submitCode = async () => {
    if (!code.trim()) return;
    setLogin(l => ({ ...l, phase: 'checking', error: undefined }));
    try { await sendLoginCode(code); setCode(''); setLogin({ phase: 'idle' }); await check(); input.current?.focus(); }
    catch (error) { setLogin(l => ({ ...l, phase: 'code', error: (error as Error).message })); }
  };
  // Focus belongs to the whole dock: moving between its field, buttons and
  // the login code keeps it open; leaving it for the canvas closes it.
  const onBlur = (e: React.FocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (next && (root.current?.contains(next) || (next as Element).closest?.('.menu'))) return;
    // Switching to the browser to sign in is not leaving.
    if (!document.hasFocus()) return;
    if (!prompt.trim()) setFocused(false);
  };

  const examples = selection.length ? EXAMPLES.selection : scene?.objects.length ? EXAMPLES.scene : EXAMPLES.empty;
  const example = examples[tick % examples.length];
  const rotating = ready && !running && !prompt;
  useEffect(() => {
    if (!rotating) return;
    const t = setInterval(() => setTick(n => n + 1), 3800);
    return () => clearInterval(t);
  }, [rotating]);
  // After a run the caret comes back, so the conversation just goes on.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running) { setFocused(true); requestAnimationFrame(() => input.current?.focus()); }
    wasRunning.current = running;
  }, [running]);
  const placeholder = running ? 'Claude работает' : !ready ? 'Подключите Claude' : '';
  const talk = thread.length > 0 || !!job;
  const setup = (needsLogin || needsKey) && !running;
  // In the field the conversation is always there, even a brand new one.
  const shown = focused || signingIn || running;
  const last = job && !job.running && thread.at(-1)?.prompt === job.prompt;
  const engineLabel = chosen === 'local' ? 'Claude Code' : 'Ключ API';
  const openEngines = (e: React.MouseEvent<HTMLButtonElement>) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.left, y: r.top - 6 }); };

  return (
    <div ref={root} className={`dock${focused ? ' is-focused' : ''}${running ? ' is-running' : ''}`}
      onPointerDown={e => e.stopPropagation()} onContextMenu={e => e.stopPropagation()}
      onFocus={() => setFocused(true)} onBlur={onBlur}
      onKeyDown={e => { if (e.key === 'Escape' && !running) { e.stopPropagation(); setFocused(false); (document.activeElement as HTMLElement | null)?.blur(); } }}>
      <div className="dock-body">
        {running && <div className="dock-scan" aria-hidden />}
        {/* Unfolds by height; what it shows stays put while it folds away. */}
        <div className={`dock-fold${shown ? ' is-shown' : ''}`} inert={!shown}>
          <div className="dock-fold-inner">
            <div className="dock-panel">
              <div className="thread-head">
                {setup
                  ? <span className="thread-title"><ClaudeMark size={13} />Claude</span>
                  : <button className="thread-title" disabled={running || !editor.talks.length} onMouseDown={e => e.preventDefault()}
                      onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setTalkMenu({ x: r.left, y: r.top - 6 }); }}>
                      <ClaudeMark size={13} /><span>{editor.talks.length > 1 || !editor.talk ? editor.talk?.title ?? 'Новый разговор' : 'Claude'}</span>{editor.talks.length > 0 && <ChevronDown size={12} />}
                    </button>}
                <button className="dock-engine" onMouseDown={e => e.preventDefault()} onClick={openEngines} disabled={running}>{engineLabel}<ChevronDown size={12} /></button>
                {!setup && <button className="icon" aria-label="Новый разговор" data-tip="Новый разговор" disabled={running || !editor.talk}
                  onMouseDown={e => e.preventDefault()} onClick={() => { editor.newConversation(); input.current?.focus(); }}><SquarePen size={14} /></button>}
              </div>
              {setup ? (
                needsLogin ? (
                  <div className="connect">
                    <div className="connect-mark" aria-hidden><ClaudeMark size={20} /></div>
                    {login.phase === 'code' || login.phase === 'checking' ? <>
                      <div className="connect-text">
                        <b>Остался один шаг</b>
                        <span>Подтвердите вход в открывшейся вкладке и вставьте код, который покажет Claude. <a href={login.url} target="_blank" rel="noreferrer">Открыть вкладку <ExternalLink size={11} /></a></span>
                      </div>
                      <form className="connect-code" onSubmit={e => { e.preventDefault(); submitCode(); }}>
                        <input autoFocus value={code} onChange={e => setCode(e.target.value)} placeholder="Код подтверждения" spellCheck={false} autoComplete="off" />
                        <button className="button is-primary" disabled={!code.trim() || login.phase === 'checking'}>
                          {login.phase === 'checking' ? <LoaderCircle size={14} className="spin" /> : 'Подключить'}
                        </button>
                        <button type="button" className="button is-quiet" onClick={() => { setLogin({ phase: 'idle' }); setCode(''); }}>Отмена</button>
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
                      <input type="password" autoComplete="off" spellCheck={false} placeholder="sk-ant-…" value={keyDraft} onChange={e => setKeyDraft(e.target.value)} />
                      <button className="button is-primary" disabled={!keyDraft.trim()}>Сохранить</button>
                    </div>
                  </form>
                )
              ) : (
                <div className="thread" ref={log} aria-live="polite">
                  {!talk && <div className="thread-empty">
                    <div className="ideas">{examples.slice(0, 3).map(x => <button key={x} className="idea" onMouseDown={e => e.preventDefault()} onClick={() => ask(x)}>{x}</button>)}</div>
                  </div>}
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
                        ? <div className="turn-live">
                            <i className="live-dot" />
                            <span key={job.steps.length}>{job.steps.filter(s => s.kind !== 'text').at(-1)?.text ?? 'Начинает'}</span>
                            <em>{Math.max(0, Math.round((now - job.at) / 1000))}{"\u202F"}с</em>
                          </div>
                        : job.error
                          ? <div className="turn-end"><p className="turn-error">{job.error}</p>
                              <button className="chip-button" onClick={() => editor.generate(job.prompt, chosen, key)}><RotateCcw size={12} />Ещё раз</button></div>
                          : <div className="turn-end"><p className="turn-claude">{job.result}</p>
                              {job.changed && <button className="chip-button" onClick={() => { editor.undo(); editor.dismissJob(); }}><Undo2 size={12} />Отменить</button>}</div>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="dock-bar">
          <div className="dock-tools" ref={toolsRef}>
            {pill && <i className="dock-pill" style={{ transform: `translateX(${pill.x}px)`, width: pill.w }} />}
            {TOOLS.map(({ tool, Icon, tip, kbd }) => (
              <button key={tool} data-tool={tool} className="dock-tool" aria-pressed={editor.tool === tool} aria-label={tip} data-tip={tip} data-kbd={kbd}
                onMouseDown={e => e.preventDefault()} onClick={() => editor.setTool(tool)}><Icon size={18} /></button>
            ))}
          </div>
          <span className="dock-sep" />
          <div className={`dock-input${ready ? '' : ' is-off'}`} onMouseDown={e => { if (e.target !== input.current) { e.preventDefault(); input.current?.focus(); } }}>
            {selection.length > 0 && <span className="dock-chip">
              <Box size={12} />{selection.length === 1 ? selection[0] : `${selection.length} ${plural(selection.length)}`}
            </span>}
            <div className="dock-field">
              <textarea ref={input} rows={1} value={prompt} placeholder={placeholder} disabled={running}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                  if (e.key === 'Tab' && !e.shiftKey && rotating) { e.preventDefault(); setPrompt(example); }
                }} />
              {rotating && <span className="dock-example" key={example} aria-hidden>
                <span>{editor.hasSession && !selection.length ? 'Дальше: ' : ''}{example}</span>
                <kbd>Tab</kbd>
              </span>}
            </div>
            <kbd className="dock-kbd">⌘K</kbd>
            {running
              ? <button className="dock-send is-stop" aria-label="Остановить" data-tip="Остановить" onClick={editor.stopGenerating}><Square size={10} fill="currentColor" /></button>
              : <button className="dock-send" aria-label="Отправить" disabled={!prompt.trim() || !ready}
                  onMouseDown={e => e.preventDefault()} onClick={send}>{prompt.trim() ? <ArrowUp size={16} strokeWidth={2.4} /> : <CornerDownLeft size={14} />}</button>}
          </div>
        </div>
      </div>
      {talkMenu && <Menu x={talkMenu.x} y={talkMenu.y} above onClose={() => setTalkMenu(null)} items={[
        { heading: 'Разговоры' },
        ...editor.talks.map(t => ({ label: t.title, checked: t.id === editor.talk?.id, onSelect: () => { editor.openConversation(t.id); input.current?.focus(); } })),
        'separator' as const,
        { label: 'Новый разговор', onSelect: () => { editor.newConversation(); input.current?.focus(); } },
      ]} />}
      {menu && <Menu x={menu.x} y={menu.y} above onClose={() => setMenu(null)} items={[
        { label: local?.available ? (local.loggedIn ? 'Claude Code — ваш аккаунт' : 'Claude Code — нужен вход') : 'Claude Code не установлен', checked: chosen === 'local', disabled: !local?.available, onSelect: () => { setEngine('local'); write(ENGINE, 'local'); input.current?.focus(); } },
        { label: 'Ключ Anthropic API', checked: chosen === 'api', onSelect: () => { setEngine('api'); write(ENGINE, 'api'); input.current?.focus(); } },
        ...(chosen === 'local' && local?.loggedIn ? ['separator' as const, { label: 'Войти другим аккаунтом', onSelect: () => { setLocal(l => l && { ...l, loggedIn: false }); signIn(); } }] : []),
        ...(key ? ['separator' as const, { label: 'Забыть ключ', danger: true, onSelect: () => { write(KEY, ''); setKey(''); } }] : []),
      ]} />}
    </div>
  );
}

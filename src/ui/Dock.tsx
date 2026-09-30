import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, Box, ChevronDown, Folder, CornerDownLeft, Hand, Layers2, MousePointer2, SquarePen, Square } from 'lucide-react';
import type { Editor, Tool } from '../editor';
import { ClaudeMark } from './ClaudeMark';
import { Connect } from './Connect';
import { Chip, IconButton, Kbd, Segmented } from './kit';
import { Menu, type MenuItem } from './Menu';
import { Thread } from './Thread';
import { Dialog } from './Dialogs';
import { Guide } from './Welcome';

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
  const { claude, selection, scene } = editor;
  const { connection: c, running, open: focused, setOpen: setFocused } = claude;
  const [prompt, setPrompt] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [guide, setGuide] = useState(false);
  // Edit what's there, or build a new scene from scratch in its place.
  const [mode, setMode] = useState<'edit' | 'new'>('edit');
  const [tick, setTick] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const focus = () => input.current?.focus();

  useEffect(() => { if (focused && !root.current?.contains(document.activeElement)) focus(); }, [focused]);
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [prompt]);

  const hasScene = !!scene?.objects.length;
  // A whole group selected reads as the group.
  const picked = scene?.objects.filter(p => selection.includes(p.id)) ?? [];
  const whole = picked.length > 1 && picked[0].group && picked.every(p => p.group === picked[0].group)
    && scene!.objects.filter(p => p.group === picked[0].group).length === picked.length ? picked[0].group : undefined;
  const fresh = mode === 'new' && hasScene;
  const ask = (text: string) => {
    if (!text.trim() || running || !c.ready) return;
    claude.generate(text.trim(), fresh);
    setPrompt('');
    setMode('edit');
  };
  // Ideas elsewhere (the empty canvas) ask Claude through the same line.
  useEffect(() => {
    const onAsk = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      setFocused(true);
      if (c.ready) ask(text); else { setPrompt(text); focus(); }
    };
    window.addEventListener('isoform:ask', onAsk);
    return () => window.removeEventListener('isoform:ask', onAsk);
  });
  // Focus belongs to the whole dock: moving between its field, buttons and
  // the login code keeps it open; leaving it for the canvas closes it.
  const onBlur = (e: React.FocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (next && (root.current?.contains(next) || (next as Element).closest?.('.menu'))) return;
    // Switching to the browser to sign in is not leaving.
    if (!document.hasFocus()) return;
    if (!prompt.trim()) setFocused(false);
  };

  const examples = fresh || !hasScene ? EXAMPLES.empty : selection.length ? EXAMPLES.selection : EXAMPLES.scene;
  const example = examples[tick % examples.length];
  const rotating = c.ready && !running && !prompt;
  useEffect(() => {
    if (!rotating) return;
    const t = setInterval(() => setTick(n => n + 1), 3800);
    return () => clearInterval(t);
  }, [rotating]);
  // After a run the caret comes back, so the conversation just goes on.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running) { setFocused(true); requestAnimationFrame(focus); }
    wasRunning.current = running;
  }, [running]);

  const setup = !!c.need && !running;
  // In the field the conversation is always there, even a brand new one.
  const shown = focused || c.signingIn || running;
  const placeholder = running ? 'Claude работает' : c.need ? 'Подключите Claude' : '';
  // One menu for the conversations and who does the work.
  const items: MenuItem[] = [
    ...(claude.talks.length ? [{ heading: 'Разговоры' },
      ...claude.talks.map(t => ({ label: t.title, checked: t.id === claude.talk?.id, onSelect: () => { claude.openConversation(t.id); focus(); },
        more: [{ label: 'Удалить разговор', danger: true, onSelect: () => { claude.deleteConversation(t.id); focus(); } }] })),
      { label: 'Новый разговор', onSelect: () => { claude.newConversation(); focus(); } }, 'separator' as const] : []),
    { heading: 'Собирает' },
    { label: `Claude Code${!c.local?.available ? ' — не установлен' : !c.local.loggedIn ? ' — нужен вход' : ' — подписка Claude'}`,
      checked: c.engine === 'local', disabled: c.browserOnly, onSelect: () => { c.choose('local'); focus(); } },
    { label: 'Ключ Anthropic API', checked: c.engine === 'api', onSelect: () => { c.choose('api'); focus(); } },
    ...(c.engine === 'local' && c.local?.loggedIn ? ['separator' as const, { label: 'Войти другим аккаунтом', onSelect: c.switchAccount }] : []),
    ...(c.key ? ['separator' as const, { label: 'Забыть ключ', danger: true, onSelect: c.forgetKey }] : []),
    'separator',
    { label: 'Как работать с Claude', onSelect: () => setGuide(true) },
  ];

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
                <button className="thread-title" disabled={running} onMouseDown={e => e.preventDefault()}
                  onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.left, y: r.top - 6 }); }}>
                  <ClaudeMark size={14} /><span>{!setup && claude.talks.length > 1 ? claude.talk?.title ?? 'Новый разговор' : 'Claude'}</span><ChevronDown size={12} />
                </button>
                {!setup && hasScene && <Segmented label="Что делает Claude" size="sm" value={mode} onChange={setMode} disabled={running}
                  options={[{ value: 'edit', label: 'Править' }, { value: 'new', label: 'С нуля' }]} />}
                {!setup && <IconButton tip label="Новый разговор" disabled={running || !claude.talk}
                  onMouseDown={e => e.preventDefault()} onClick={() => { claude.newConversation(); focus(); }}><SquarePen size={14} /></IconButton>}
              </div>
              {setup ? <Connect connection={c} onReady={focus} /> : <Thread editor={editor} ideas={examples} onAsk={ask} />}
            </div>
          </div>
        </div>

        <div className="dock-bar">
          <Segmented label="Инструмент" size="lg" tone="ink" value={editor.tool} onChange={editor.setTool}
            options={TOOLS.map(({ tool, Icon, tip, kbd }) => ({ value: tool, label: <Icon size={18} />, aria: tip, ...(tool === 'block' || tool === 'plate' ? { tip, kbd } : {}) }))} />
          <span className="dock-sep" />
          <div className={`dock-input${c.ready ? '' : ' is-off'}`} onMouseDown={e => { if (e.target !== input.current) { e.preventDefault(); focus(); } }}>
            {selection.length > 0 && !fresh && <Chip mono icon={whole ? <Folder size={12} /> : <Box size={12} />}>{whole ?? (selection.length === 1 ? selection[0] : `${selection.length} ${plural(selection.length)}`)}</Chip>}
            <div className="dock-field">
              <textarea ref={input} rows={1} value={prompt} placeholder={placeholder} disabled={running}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(prompt); }
                  if (e.key === 'Tab' && !e.shiftKey && rotating) { e.preventDefault(); setPrompt(example); }
                }} />
              {rotating && <span className="dock-example" key={example} aria-hidden>
                <span>{claude.hasSession && !selection.length ? 'Дальше: ' : ''}{example}</span>
                <Kbd>Tab</Kbd>
              </span>}
            </div>
            {running
              ? <button className="dock-send" aria-label="Остановить" data-tip="Остановить" onClick={claude.stop}><Square size={10} fill="currentColor" /></button>
              : <button className="dock-send" aria-label="Отправить" disabled={!prompt.trim() || !c.ready}
                  onMouseDown={e => e.preventDefault()} onClick={() => ask(prompt)}>{prompt.trim() ? <ArrowUp size={16} strokeWidth={2.4} /> : <CornerDownLeft size={14} />}</button>}
          </div>
        </div>
      </div>
      {menu && <Menu x={menu.x} y={menu.y} above onClose={() => setMenu(null)} items={items} />}
      {guide && <Dialog title="Как работать с Claude" wide onClose={() => { setGuide(false); focus(); }}><div className="guide-dialog"><Guide /></div></Dialog>}
    </div>
  );
}

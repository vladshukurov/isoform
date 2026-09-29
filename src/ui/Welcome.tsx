import { useEffect, useState } from 'react';
import { ArrowUp, Box, Check, MousePointerClick, Plus, Sparkles } from 'lucide-react';
import { ENGINES, type Connection, type EngineId } from '../ai/connection';
import { CardPreview } from '../CardPreview';
import type { Editor } from '../editor';
import type { Scene } from '../model';
import { Connect, EngineMark } from './Connect';
import { Dialog } from './Dialogs';
import { Mark } from './Glyph';
import { Chip, Code, Dot, Kbd, Spinner } from './kit';

// A scene that plays its hover by itself, every couple of seconds.
function Breathing({ scene }: { scene: Scene }) {
  const [on, setOn] = useState(false);
  useEffect(() => { const t = setInterval(() => setOn(v => !v), 2200); return () => clearInterval(t); }, []);
  return <CardPreview scene={scene} hold={on} />;
}

// How to work with the agent, in four cards; on the first screen and from the dock.
export function Guide() {
  return (
    <div className="guide">
      <article>
        <div className="guide-art"><div className="guide-prompt"><span>Сейф на плите, дверца приоткрывается при наведении</span><i><ArrowUp size={12} /></i></div></div>
        <b>Опишите предмет и движение</b>
        <p>Что стоит на сцене и что происходит при наведении. Блоки появляются на холсте по мере того, как их пишут.</p>
      </article>
      <article>
        <div className="guide-art"><div className="guide-prompt"><Chip mono icon={<Box size={12} />}>2 блока</Chip><span>Сделай вдвое тоньше</span></div></div>
        <b>Выделите — и правка только там</b>
        <p>Выделенные блоки попадают в запрос. Остальная сцена не трогается, новые детали встают рядом.</p>
      </article>
      <article>
        <div className="guide-art guide-thread"><span>Сделай ниже и шире</span><span>Добавь волну задержек</span></div>
        <b>Продолжайте разговор</b>
        <p>Уточняйте следующими сообщениями — контекст сохраняется. Каждый шаг отменяется целиком: <Kbd>⌘Z</Kbd>.</p>
      </article>
      <article>
        <div className="guide-art"><div className="guide-modes"><span>Править</span><span className="is-on">С нуля</span></div></div>
        <b>Править или собрать заново</b>
        <p>«Править» меняет то, что есть. «С нуля» собирает новую сцену на месте текущей — старая бледнеет, пока не придёт новая.</p>
      </article>
    </div>
  );
}

// Three ways to have scenes built, as cards with their state.
export function Engines({ c }: { c: Connection }) {
  const state = (id: EngineId) => {
    if (id === 'api') return c.key ? { text: 'ключ сохранён', ok: true } : { text: 'нужен ключ', ok: false };
    if (!c.local) return { text: 'проверяем', ok: false, checking: true };
    const cli = id === 'codex' ? c.local.codex : c.local;
    return !cli?.available ? { text: 'не установлен', ok: false } : !cli.loggedIn ? { text: 'нужен вход', ok: false } : { text: 'готов', ok: true };
  };
  return (
    <div className="engines" role="radiogroup" aria-label="Кто собирает сцены">
      {(['local', 'codex', 'api'] as const).filter(id => !c.browserOnly || id === 'api').map(id => {
        const s = state(id);
        return (
          <button key={id} role="radio" aria-checked={c.engine === id} className="engine" onClick={() => c.choose(id)}>
            <span className={`engine-mark is-${id}`}><EngineMark engine={id} size={18} /></span>
            <span className="engine-text"><b>{ENGINES[id].name}</b><span>{ENGINES[id].account}</span></span>
            <span className={`engine-state${s.ok ? ' is-ok' : ''}`}>{s.checking ? <Spinner size={11} /> : <Dot tone={s.ok ? 'ok' : 'muted'} />}{s.text}</span>
          </button>
        );
      })}
    </div>
  );
}

// The first screen for someone who has just cloned the project: what this is,
// how to work with the agent, connecting it, and starting a scene. Also in
// the main menu as «Начало работы».
export function Welcome({ editor, onClose }: { editor: Editor; onClose?: () => void }) {
  const { claude } = editor, c = claude.connection;
  const templates = Object.entries(editor.templates);
  const hero = editor.templates.storage ?? templates[0]?.[1];
  const start = (template?: string) => { editor.createFile(template); onClose?.(); };
  const withAgent = () => { editor.createFile(); claude.setOpen(true); onClose?.(); };
  const agentName = c.engine === 'codex' ? 'Codex' : 'Claude';

  return (
    <Dialog title="Начало работы" onClose={onClose} wide>
      <div className="welcome">
        <section className="welcome-hero">
          <div className="welcome-hero-text">
            <span className="logo"><Mark size={22} /></span>
            <h1>Изометрия для Passwork — словами и руками</h1>
            <p>Опишите идею — Claude или Codex соберёт сцену из блоков прямо на холсте. Потом доведите её руками: сдвиньте детали, задайте движение при наведении и скачайте SVG для сайта.</p>
            <span className="welcome-note"><MousePointerClick size={14} />Справа — сцена серии: так она оживает на сайте при наведении</span>
          </div>
          {hero && <div className="welcome-hero-art"><Breathing scene={hero} /></div>}
        </section>

        <section className="welcome-block">
          <h2><Sparkles size={15} />Как работать с Claude и Codex</h2>
          <Guide />
        </section>

        <section className="welcome-block">
          <h2><span className={`welcome-num${c.ready ? ' is-done' : ''}`}>{c.ready ? <Check size={12} /> : 1}</span>Кто собирает сцены</h2>
          <Engines c={c} />
          {c.need && <div className="welcome-connect"><Connect connection={c} /></div>}
        </section>

        <section className="welcome-block">
          <h2><span className="welcome-num">2</span>Начните сцену</h2>
          <div className="tiles is-compact">
            <button className="tile" onClick={withAgent} disabled={!c.ready}>
              <div className="tile-art tile-blank tile-agent"><EngineMark engine={c.engine === 'api' ? 'local' : c.engine} size={24} /></div>
              <span>{c.ready ? `Собрать с ${agentName}` : 'Сначала подключите'}</span>
            </button>
            <button className="tile" onClick={() => start()}>
              <div className="tile-art tile-blank"><Plus size={20} /></div>
              <span>Пустой</span>
            </button>
            {templates.map(([name, scene]) => (
              <button key={name} className="tile" onClick={() => start(name)}>
                <div className="tile-art"><CardPreview scene={scene} /></div>
                <span>{scene.title}</span>
              </button>
            ))}
          </div>
        </section>

        <p className="welcome-foot">
          <span><Kbd>?</Kbd> все клавиши</span>
          <span>Обновить редактор: <Code>git pull</Code> <Code>npm install</Code> <Code>npm run dev</Code></span>
          <span>Этот экран — в меню файла, «Начало работы»</span>
        </p>
      </div>
    </Dialog>
  );
}

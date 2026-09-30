// /design.html — Isoform's design system, live: the tokens, every primitive
// in every state, and the editor's patterns built from them. Everything here
// is the real component with made-up state, so the page can't drift from the app.
import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowDownToLine, Box, ChevronDown, Hand, Layers2, MousePointer2, CircleAlert, CloudAlert, CopyPlus, Download, FlipHorizontal2, Moon, Plus, Redo2, SquarePen, Sun, Undo2, X,
} from 'lucide-react';
import storage from '../../templates/storage.json';
import type { JobState } from '../ai/claude';
import type { Connection } from '../ai/connection';
import type { Turn } from '../ai/talks';
import { CardPreview } from '../CardPreview';
import { validateScene, type Scene } from '../model';
import { ClaudeMark } from '../ui/ClaudeMark';
import { Connect } from '../ui/Connect';
import { Mark } from '../ui/Glyph';
import { Button, Chip, Code, CopyBlock, Dot, EmptyState, IconButton, Kbd, Notice, Segmented, Spinner, TextField, type ButtonVariant } from '../ui/kit';
import { LayersPanel } from '../ui/LayersPanel';
import { NumberField } from '../ui/NumberField';
import { ThreadView } from '../ui/Thread';
import { Engines, Guide } from '../ui/Welcome';
import { Easing, Timeline } from '../ui/Motion';
import { connection, editor } from './mock';

const scene = validateScene(storage);
const TOOLS = [
  { value: 'move' as const, label: <MousePointer2 size={18} />, aria: 'Выбор', tip: 'Выбор', kbd: 'V' },
  { value: 'hand' as const, label: <Hand size={18} />, aria: 'Рука', tip: 'Рука', kbd: 'H' },
  { value: 'block' as const, label: <Box size={18} />, aria: 'Блок', tip: 'Блок', kbd: 'B' },
  { value: 'plate' as const, label: <Layers2 size={18} />, aria: 'Плита', tip: 'Плита', kbd: 'P' },
];
const noop = () => undefined;

const SECTIONS = [
  ['principles', 'Принципы'], ['color', 'Цвет'], ['type', 'Типографика'], ['space', 'Отступы и размеры'], ['radius', 'Радиусы'],
  ['elevation', 'Тени'], ['motion', 'Движение'],
  ['button', 'Button'], ['icon-button', 'IconButton'], ['segmented', 'Segmented'], ['field', 'TextField'], ['number', 'NumberField'],
  ['small', 'Chip · Kbd · Code · Dot · Spinner'], ['notice', 'Notice'], ['empty', 'EmptyState'], ['copy', 'CopyBlock'],
  ['overlays', 'Menu · Tooltip · Toast · Dialog'],
  ['file', 'Файл'], ['layers', 'Слои'], ['engines', 'Кто собирает'], ['connect', 'Подключение'], ['guide', 'Как работать с агентом'], ['thread', 'Разговор'], ['dock', 'Нижняя панель'], ['motion-tool', 'Движение'],
  ['canvas', 'Холст'], ['tiles', 'Плитки сцен'], ['system', 'Загрузка и сбой'],
] as const;

export function Design() {
  const [dark, setDark] = useState(() => { try { return localStorage.getItem('isoform-theme') === 'dark'; } catch { return false; } });
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, [dark]);
  return (
    <div className="ds">
      <nav className="ds-nav">
        <div className="ds-brand"><span className="logo"><Mark size={20} /></span><b>Isoform</b><span>дизайн-система</span></div>
        <Segmented label="Тема" wide value={dark ? 'dark' : 'light'} onChange={v => setDark(v === 'dark')}
          options={[{ value: 'light', label: <><Sun size={13} />Светлая</> }, { value: 'dark', label: <><Moon size={13} />Тёмная</> }]} />
        <h4>Основы</h4>
        {SECTIONS.slice(0, 7).map(([id, name]) => <a key={id} href={`#${id}`}>{name}</a>)}
        <h4>Компоненты</h4>
        {SECTIONS.slice(7, 17).map(([id, name]) => <a key={id} href={`#${id}`}>{name}</a>)}
        <h4>Паттерны</h4>
        {SECTIONS.slice(17).map(([id, name]) => <a key={id} href={`#${id}`}>{name}</a>)}
      </nav>
      <main className="ds-main">
        <header className="ds-hero">
          <h1>Дизайн-система Isoform</h1>
          <p>Токены, примитивы и паттерны редактора — живые компоненты из <Code>src/ui/kit.tsx</Code> и <Code>src/styles/</Code>. Всё, что здесь, — то же, что в приложении, поэтому страница не расходится с кодом. Состояния «наведение» и «фокус» закреплены для обзора; остальные можно потрогать.</p>
        </header>
        <Foundations />
        <Components />
        <Patterns />
      </main>
    </div>
  );
}

// —— Layout helpers

function Section({ id, title, lead, children }: { id: string; title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <section className="ds-section" id={id}>
      <h2>{title}</h2>
      {lead && <p className="ds-lead">{lead}</p>}
      {children}
    </section>
  );
}
// A row of states: each cell names its state under the specimen.
function States({ children, label }: { children: ReactNode; label?: string }) {
  return <div className="ds-states">{label && <span className="ds-row-label">{label}</span>}{children}</div>;
}
const Cell = ({ name, children, wide }: { name: string; children: ReactNode; wide?: boolean }) =>
  <figure className={`ds-cell${wide ? ' is-wide' : ''}`}><div className="ds-specimen">{children}</div><figcaption>{name}</figcaption></figure>;
// A piece of the app on the canvas colour, sized like the real thing.
const Stage = ({ children, height, className }: { children: ReactNode; height?: number; className?: string }) =>
  <div className={`ds-stage${className ? ` ${className}` : ''}`} style={height ? { height } : undefined}>{children}</div>;

// —— Foundations

const COLORS: [string, [string, string][]][] = [
  ['Поверхности', [['--canvas', 'Фон под всем'], ['--surface', 'Плавающее стекло'], ['--surface-solid', 'Диалоги, приподнятые пилюли'], ['--field', 'Поля, вторичные кнопки'], ['--field-hover', 'Они же при наведении'], ['--row-hover', 'Строка при наведении'], ['--row-selected', 'Выбранная строка']]],
  ['Текст и линии', [['--text', 'Основной текст'], ['--muted', 'Вторичный текст, иконки'], ['--faint', 'Плейсхолдеры, выключенное'], ['--line', 'Разделители'], ['--line-strong', 'Контуры, рамки клавиш']]],
  ['Акцент', [['--ink', 'Всё «включённое»: выбор, главное действие, фокус'], ['--on-ink', 'Текст на ink']]],
  ['Смысл', [['--danger', 'Ошибка, удаление'], ['--danger-soft', 'Фон ошибки'], ['--ok', 'Успех, подключено'], ['--ok-soft', 'Фон успеха'], ['--claude', 'Claude'], ['--claude-soft', 'Фон знака Claude'], ['--guide', 'Направляющие, плейхед']]],
  ['Арт (токены сайта)', [['--page', 'Грань сверху и слева'], ['--page-shade', 'Грань справа'], ['--stroke', 'Рёбра'], ['--stroke-strong', 'Контур'], ['--hover-line', 'Контур при наведении'], ['--hover-top', 'Грань при наведении']]],
];

function Foundations() {
  return <>
    <Section id="principles" title="Принципы">
      <ol className="ds-principles">
        <li><b>Холст главный.</b> Интерфейс — стеклянные карточки над сценой; они не спорят с иллюстрацией и уходят по <Kbd>⌘\</Kbd>.</li>
        <li><b>Один акцент.</b> Всё «включённое» — выбор, главное действие, фокус — одним цветом ink. Цвет только со смыслом: красный — беда, зелёный — готово, терракота — Claude.</li>
        <li><b>У каждой ошибки есть выход.</b> Не «что-то пошло не так», а что случилось и одна кнопка, которая это чинит.</li>
        <li><b>Пустое место учит.</b> Пустой список, холст или панель говорят, как их заполнить, с клавишами.</li>
        <li><b>Спокойное движение.</b> Никаких пружин: 140 мс на цвет, 240 мс на пилюли и панели, 400 мс на появление.</li>
      </ol>
    </Section>

    <Section id="color" title="Цвет" lead="Семантические токены: имя говорит, для чего цвет, а не какой он. Тёмная тема переопределяет те же имена.">
      {COLORS.map(([group, list]) => (
        <div key={group} className="ds-group">
          <h3>{group}</h3>
          <div className="ds-swatches">
            {list.map(([token, use]) => <div key={token} className="ds-swatch"><i style={{ background: `var(${token})` }} /><Code>{token}</Code><span>{use}</span></div>)}
          </div>
        </div>
      ))}
    </Section>

    <Section id="type" title="Типографика" lead={<>Geist и Geist Mono. Моноширинный — для чисел, id блоков, ключей и команд. Основной размер — <Code>--t-md</Code>.</>}>
      <div className="ds-type">
        {([['--t-2xl', '20 / 650', 'Заголовок первого экрана', 650], ['--t-xl', '15 / 600', 'Заголовок диалога', 600], ['--t-lg', '13.5', 'Строка ввода для Claude', 400],
          ['--t-md', '12.5', 'Основной текст, кнопки, слои', 400], ['--t-sm', '11.5', 'Мета, чипы, маленькие кнопки', 400], ['--t-xs', '11', 'Подписи, клавиши, бейджи', 400]] as const).map(([t, size, use, weight]) => (
          <div key={t} className="ds-type-row"><Code>{t}</Code><span className="ds-type-size">{size}</span><span style={{ fontSize: `var(${t})`, fontWeight: weight }}>{use}</span></div>
        ))}
        <div className="ds-type-row"><Code>--mono</Code><span className="ds-type-size">12.5</span><span style={{ font: 'var(--t-md) var(--mono)' }}>card-lid · x 120 · sk-ant-…</span></div>
      </div>
    </Section>

    <Section id="space" title="Отступы и размеры" lead="Шкала отступов 4 → 24 и четыре высоты контролов: 24 — чипы, 28 — иконки и сегменты, 32 — кнопки, поля и строки, 44 — плавающий хром.">
      <div className="ds-space">
        {[1, 2, 3, 4, 5, 6, 7, 8].map(n => <div key={n} className="ds-space-row"><Code>--s-{n}</Code><i style={{ width: `var(--s-${n})` }} /><span>{[4, 6, 8, 10, 12, 16, 20, 24][n - 1]}</span></div>)}
      </div>
      <div className="ds-heights">
        {(['xs', 'sm', 'md', 'lg'] as const).map(h => <div key={h}><i style={{ height: `var(--h-${h})` }} /><Code>--h-{h}</Code><span>{{ xs: 24, sm: 28, md: 32, lg: 44 }[h]}</span></div>)}
      </div>
    </Section>

    <Section id="radius" title="Радиусы" lead="Вложенный угол меньше внешнего на отступ между ними: пилюля 8 внутри сегмента 10 с отступом 3, пункт меню 8 внутри меню 14 с отступом 6.">
      <div className="ds-radii">
        {[1, 2, 3, 4, 5, 6, 7].map(n => <div key={n}><i style={{ borderRadius: `var(--r-${n})` }} /><Code>--r-{n}</Code><span>{[6, 8, 10, 12, 14, 18, 22][n - 1]}</span></div>)}
      </div>
    </Section>

    <Section id="elevation" title="Тени" lead="Три уровня: стекло на холсте, всплывающее (меню, диалоги, фокус дока) и приподнятая пилюля в сегменте. У ink-кнопок своя тень.">
      <div className="ds-shadows">
        {([['--shadow', 'Плавающие панели'], ['--shadow-pop', 'Меню, диалоги, наведение'], ['--shadow-raised', 'Пилюля сегмента'], ['--shadow-ink', 'Главная кнопка']] as const).map(([t, use]) =>
          <div key={t}><i style={{ boxShadow: `var(${t})` }} /><Code>{t}</Code><span>{use}</span></div>)}
      </div>
    </Section>

    <Section id="motion" title="Движение" lead={<>Одна кривая <Code>--ease</Code> и три длительности. Наведите на дорожки.</>}>
      <div className="ds-motion">
        {([['--fast', '140 мс', 'цвет, фон при наведении'], ['--mid', '240 мс', 'пилюли, панели, выцветание'], ['--slow', '400 мс', 'появление хрома']] as const).map(([t, ms, use]) => (
          <div key={t} className="ds-motion-row"><Code>{t}</Code><span>{ms}</span><div className="ds-track"><i style={{ transitionDuration: `var(${t})` }} /></div><span>{use}</span></div>
        ))}
      </div>
    </Section>
  </>;
}

// —— Components

const VARIANTS: [ButtonVariant, string, string][] = [
  ['primary', 'Главное', 'Одно главное действие в месте'], ['secondary', 'Обычная', 'Всё остальное'], ['quiet', 'Тихая', 'Рядом с главной: «Отмена»'],
  ['danger', 'Удалить', 'Разрушает'], ['link', 'Или ключ API', 'Выход в тексте'], ['glass', 'Сейф с дверцей', 'Над холстом'],
];

function Components() {
  const [seg, setSeg] = useState<'rest' | 'hover'>('rest');
  const [mode, setMode] = useState<'edit' | 'new'>('edit');
  const [tool, setTool] = useState<'move' | 'hand' | 'block' | 'plate'>('move');
  return <>
    <Section id="button" title="Button" lead={<>Текст и, при нужде, иконка слева. Размеры: <Code>sm</Code> 24 — действия в строке, <Code>md</Code> 32 — обычный, <Code>lg</Code> 44 — плавающий хром. Загрузка блокирует кнопку и показывает спиннер вместо иконки.</>}>
      {VARIANTS.map(([v, label, use]) => (
        <States key={v} label={`${v} — ${use}`}>
          <Cell name="обычная"><Button variant={v}>{label}</Button></Cell>
          <Cell name="наведение"><Button variant={v} className="is-hover">{label}</Button></Cell>
          <Cell name="фокус"><Button variant={v} className="is-focus-ring">{label}</Button></Cell>
          <Cell name="выключена"><Button variant={v} disabled>{label}</Button></Cell>
          {v !== 'link' && <Cell name="загрузка"><Button variant={v} loading>{label}</Button></Cell>}
        </States>
      ))}
      <States label="Размеры и иконка">
        <Cell name="sm"><Button size="sm" icon={<Undo2 size={12} />}>Отменить</Button></Cell>
        <Cell name="md"><Button icon={<Plus size={14} />}>Новый файл</Button></Cell>
        <Cell name="lg"><Button variant="primary" size="lg" icon={<Download size={16} />}>Скачать</Button></Cell>
      </States>
    </Section>

    <Section id="icon-button" title="IconButton" lead={<>Иконка без подписи. <Code>label</Code> обязателен: это и имя для читалок, и подсказка; <Code>kbd</Code> добавляет клавишу в подсказку. Нажатая — ink.</>}>
      {(['plain', 'field', 'glass'] as const).map(v => (
        <States key={v} label={{ plain: 'plain — в панелях', field: 'field — ряд инструментов', glass: 'glass — над холстом' }[v]}>
          <Cell name="обычная"><IconButton variant={v} size={v === 'glass' ? 'lg' : 'md'} label="Повторить"><CopyPlus size={14} /></IconButton></Cell>
          <Cell name="наведение"><IconButton variant={v} size={v === 'glass' ? 'lg' : 'md'} label="Повторить" className="is-hover"><CopyPlus size={14} /></IconButton></Cell>
          <Cell name="нажата"><IconButton variant={v} size={v === 'glass' ? 'lg' : 'md'} label="Повторить" pressed><CopyPlus size={14} /></IconButton></Cell>
          <Cell name="фокус"><IconButton variant={v} size={v === 'glass' ? 'lg' : 'md'} label="Повторить" className="is-focus-ring"><CopyPlus size={14} /></IconButton></Cell>
          <Cell name="выключена"><IconButton variant={v} size={v === 'glass' ? 'lg' : 'md'} label="Повторить" disabled><CopyPlus size={14} /></IconButton></Cell>
        </States>
      ))}
      <States label="Размеры">
        <Cell name="sm 28"><IconButton label="Новый разговор"><SquarePen size={14} /></IconButton></Cell>
        <Cell name="md 32"><IconButton size="md" variant="field" label="На опору" kbd="G"><ArrowDownToLine size={14} /></IconButton></Cell>
        <Cell name="lg 44"><IconButton size="lg" label="Отменить" kbd="⌘Z"><Undo2 size={17} /></IconButton></Cell>
      </States>
    </Section>

    <Section id="segmented" title="Segmented" lead="Один вариант из нескольких; пилюля переезжает к выбранному. surface — вкладки и режимы, ink — инструменты. Попробуйте.">
      <States>
        <Cell name="surface · md · wide" wide><Segmented label="Состояние" wide value={seg} onChange={setSeg} options={[{ value: 'rest', label: 'Дизайн' }, { value: 'hover', label: 'Наведение' }]} /></Cell>
        <Cell name="surface · sm"><Segmented label="Режим" size="sm" value={mode} onChange={setMode} options={[{ value: 'edit', label: 'Править' }, { value: 'new', label: 'С нуля' }]} /></Cell>
        <Cell name="выключен (идёт работа)"><Segmented label="Режим" size="sm" value="edit" onChange={noop} disabled options={[{ value: 'edit', label: 'Править' }, { value: 'new', label: 'С нуля' }]} /></Cell>
        <Cell name="ink · lg — инструменты"><Segmented label="Инструмент" size="lg" tone="ink" value={tool} onChange={setTool}
          options={TOOLS} /></Cell>
      </States>
    </Section>

    <Section id="field" title="TextField" lead={<>Поле ввода. <Code>mono</Code> — для ключей, кодов и чисел; <Code>invalid</Code> — когда введённое не подходит, вместе с <Code>Notice</Code> под полем о том, что не так.</>}>
      <States>
        <Cell name="пусто"><TextField placeholder="Подпись для экранных читалок" /></Cell>
        <Cell name="заполнено"><TextField defaultValue="Стопка карточек доступа" /></Cell>
        <Cell name="наведение"><TextField className="is-hover" defaultValue="Стопка карточек" /></Cell>
        <Cell name="фокус"><TextField className="is-focus" defaultValue="Стопка карточек" /></Cell>
        <Cell name="mono · ошибка"><TextField mono invalid defaultValue="ant-123" /></Cell>
        <Cell name="выключено"><TextField disabled defaultValue="Только чтение" /></Cell>
      </States>
    </Section>

    <Section id="number" title="NumberField" lead="Поле числа как в Figma: метку тянут мышью, в поле работает арифметика (120/2), ↑↓ — шаг, Shift — ×5.">
      <States>
        <Cell name="значение"><div className="ds-w"><NumberField label="X" value={120} onCommit={noop} onScrub={noop} /></div></Cell>
        <Cell name="разные у выделенных"><div className="ds-w"><NumberField label="Z" value={undefined} onCommit={noop} /></div></Cell>
        <Cell name="меняется при наведении"><div className="ds-w"><NumberField label="Z" value={40} accent onCommit={noop} /></div></Cell>
        <Cell name="заблокирован"><div className="ds-w"><NumberField label="W" value={80} disabled onCommit={noop} /></div></Cell>
      </States>
    </Section>

    <Section id="small" title="Chip · Kbd · Code · Dot · Spinner">
      <States label="Chip — метка в строке ввода и в шапке">
        <Cell name="plain · mono"><Chip mono icon={<Box size={12} />}>card-lid</Chip></Cell>
        <Cell name="plain"><Chip>Браузер</Chip></Cell>
        <Cell name="ink"><Chip tone="ink">С нуля</Chip></Cell>
      </States>
      <States label="Kbd и Code">
        <Cell name="клавиша"><Kbd>⌘K</Kbd></Cell>
        <Cell name="команда"><Code>npm run dev</Code></Cell>
      </States>
      <States label="Dot — статус, live дышит">
        <Cell name="ink · live"><Dot live /></Cell>
        <Cell name="muted · live — сохраняется"><Dot tone="muted" live /></Cell>
        <Cell name="ok"><Dot tone="ok" /></Cell>
        <Cell name="danger"><Dot tone="danger" /></Cell>
        <Cell name="Spinner"><Spinner /></Cell>
      </States>
    </Section>

    <Section id="notice" title="Notice" lead="Сообщение на месте: что случилось и, если есть, что сделать. Ошибка без выхода — не ошибка, а тупик.">
      <div className="ds-stack">
        <Notice>Шаблон откроется копией — оригинал серии не меняется.</Notice>
        <Notice tone="error" action={<><Button size="sm">Ключ API</Button><Button size="sm">Ещё раз</Button></>}>Лимит подписки Claude закончился — обновится в 2:40</Notice>
        <Notice tone="success">Claude Code подключён — ваша подписка</Notice>
      </div>
    </Section>

    <Section id="empty" title="EmptyState" lead="Пустое место говорит, для чего оно и как его заполнить.">
      <Stage className="ds-panelish"><EmptyState icon={<Box size={18} />} title="Пока пусто"><Kbd>B</Kbd> блок · <Kbd>P</Kbd> плита · <Kbd>⌘K</Kbd> Claude</EmptyState></Stage>
    </Section>

    <Section id="copy" title="CopyBlock" lead="Текст, который копируют как есть: команды, конфиги.">
      <div className="ds-stack ds-narrow"><CopyBlock mono text="npm install -g @anthropic-ai/claude-code" /></div>
    </Section>

    <Section id="overlays" title="Menu · Tooltip · Toast · Dialog" lead={<>Меню: стрелки ходят по пунктам, Enter выбирает, Esc закрывает. Тост: ink — новости, красный — беда, с кнопкой — когда можно отменить. Диалог закрывается по Esc и клику мимо.</>}>
      <div className="ds-overlays">
        <div className="menu ds-static" role="menu">
          <div className="menu-heading">Файлы</div>
          <button role="menuitemcheckbox" aria-checked><span className="menu-check">✓</span><span className="menu-label">config</span></button>
          <button className="is-hover-row"><span className="menu-check" /><span className="menu-label">demo-vault</span></button>
          <button><span className="menu-check" /><span className="menu-label">Все файлы и серия…</span></button>
          <hr />
          <button><span className="menu-check" /><span className="menu-label">Открыть JSON…</span><kbd>⌘O</kbd></button>
          <button disabled><span className="menu-check" /><span className="menu-label">Дублировать</span></button>
          <button className="is-danger"><span className="menu-check" /><span className="menu-label">Удалить</span></button>
        </div>
        <div className="ds-stack">
          <div className="tooltip ds-static">На опору<kbd>G</kbd></div>
          <div className="toast ds-static">Промпт скопирован — вставьте в Claude или Codex</div>
          <div className="toast is-error ds-static"><CircleAlert size={14} />Имя файла: латиница, цифры и дефис</div>
          <div className="toast toast-action ds-static"><span>Файл изменён снаружи · 3 блока</span><button>Отменить</button><IconButton label="Закрыть" tip={false}><X size={12} /></IconButton></div>
        </div>
        <div className="dialog ds-static" role="dialog" aria-label="Удалить config?">
          <header><h2>Удалить config?</h2><IconButton label="Закрыть" tip={false}><X size={14} /></IconButton></header>
          <div className="dialog-body"><p>Файл files/config.json удалится с диска. Отменить это нельзя.</p></div>
          <div className="dialog-actions"><Button variant="quiet">Отмена</Button><Button variant="danger">Удалить</Button></div>
        </div>
      </div>
    </Section>
  </>;
}

// —— Patterns

const layered = (patch: (s: Scene) => Scene) => patch(structuredClone(scene));
const running = (step: string, seconds: number): JobState => ({ file: 'x', prompt: 'Сейф с дверцей, которая приоткрывается', steps: [{ kind: 'tool', text: step }], running: true, at: 0 });
const ended = (patch: Partial<JobState>): JobState => ({ file: 'x', prompt: 'Добавь крышку, которая приподнимается', steps: [], running: false, at: 0, ...patch });
const IDEAS = ['Сейф на плите, дверца приоткрывается', 'Стопка карточек доступа', 'Сервер с тремя дисками'];

function Patterns() {
  const c = (state: Partial<Connection>) => connection(state);
  const thread = (props: { job?: JobState | null; turns?: Turn[]; checking?: boolean; now?: number }) =>
    <Stage className="ds-dockish"><ThreadView thread={props.turns ?? []} job={props.job ?? null} checking={props.checking} ideas={IDEAS} now={props.now}
      onAsk={noop} onRetry={noop} onFix={noop} onUndo={noop} /></Stage>;
  return <>
    <Section id="file" title="Файл" lead="Пилюля файла слева сверху: имя открывает меню, двойной клик — переименовать. Справа от имени — состояние сохранения.">
      <States>
        {([['сохранено', null], ['сохраняется', <span className="save-state"><Dot tone="muted" live /></span>],
          ['не сохранено', <span className="save-state is-error"><CloudAlert size={14} />Не сохранено</span>], ['файлы в браузере', <Chip>Браузер</Chip>]] as const).map(([name, state]) => (
          <Cell key={name} name={name}><Stage><div className="file-pill surface ds-inline"><span className="logo"><Mark size={20} /></span><span className="file-name">config</span>{state}<ChevronDown size={14} className="file-chevron" /></div></Stage></Cell>
        ))}
      </States>
    </Section>

    <Section id="layers" title="Слои" lead="Порядок отрисовки, ближние сверху. Выбранные строки сливаются в блок; скрытые бледнеют; у заблокированных и скрытых видно переключатель; пересечения — красный треугольник.">
      <div className="ds-row">
        <Stage className="ds-panel-stage"><aside className="panel left surface ds-panel">
          <div className="panel-title"><h3>Слои</h3></div>
          <LayersPanel editor={editor({
            // One hidden, one locked, one pushed into the body to show the overlap warning.
            scene: layered(s => ({ ...s, objects: s.objects.map((p, i) => i === 0 ? { ...p, hidden: true } : i === 2 ? { ...p, locked: true } : i === 3 ? { ...p, y: p.y - 20 } : p) })),
            selection: [scene.objects.at(-1)!.id, scene.objects.at(-2)!.id], hovered: scene.objects.at(-4)!.id, renaming: null, mode: 'rest',
          })} />
        </aside></Stage>
        <Stage className="ds-panel-stage"><aside className="panel left surface ds-panel">
          <div className="panel-title"><h3>Слои</h3></div>
          <LayersPanel editor={editor({ scene: { ...scene, objects: [] }, selection: [], hovered: null, renaming: null, mode: 'rest' })} />
        </aside></Stage>
      </div>
    </Section>

    <Section id="engines" title="Кто собирает" lead="Два пути: Claude Code на компьютере по подписке человека или ключ API с оплатой за использование. У каждой карточки — её состояние.">
      <div className="ds-stack">
        <Engines c={c({ local: { available: true, loggedIn: true, version: '2.1.197' } })} />
        <Engines c={c({ engine: 'api', need: 'key', ready: false, local: { available: true, loggedIn: false } })} />
      </div>
    </Section>

    <Section id="guide" title="Как работать с агентом" lead="Четыре приёма генерации: на первом экране и по кнопке ? в доке.">
      <Guide />
    </Section>

    <Section id="connect" title="Подключение" lead="Показывает ровно тот шаг, которого не хватает, и другие пути ссылками. Один и тот же компонент в доке и на первом экране.">
      <div className="ds-grid">
        <Cell name="нет Claude Code" wide><Stage className="ds-dockish"><Connect connection={c({ need: 'install', ready: false, local: { available: false } })} /></Stage></Cell>
        <Cell name="нужен вход" wide><Stage className="ds-dockish"><Connect connection={c({ need: 'login', ready: false })} /></Stage></Cell>
        <Cell name="открывается вход" wide><Stage className="ds-dockish"><Connect connection={c({ need: 'login', ready: false, login: { phase: 'opening' } })} /></Stage></Cell>
        <Cell name="ждём код" wide><Stage className="ds-dockish"><Connect connection={c({ need: 'login', ready: false, login: { phase: 'code', url: '#' } })} focus={false} /></Stage></Cell>
        <Cell name="код не подошёл" wide><Stage className="ds-dockish"><Connect connection={c({ need: 'login', ready: false, login: { phase: 'code', url: '#', error: 'Код не подошёл — попробуйте ещё раз' } })} focus={false} /></Stage></Cell>
        <Cell name="ключ API" wide><Stage className="ds-dockish"><Connect connection={c({ engine: 'api', need: 'key', ready: false })} /></Stage></Cell>
      </div>
    </Section>

    <Section id="thread" title="Разговор с Claude" lead="Над строкой ввода. Пустой — идеи в одно касание; идёт работа — последний шаг и секундомер; итог — одна фраза и «Отменить»; ошибка — что случилось и выход.">
      <div className="ds-grid">
        <Cell name="проверяем Claude" wide>{thread({ checking: true })}</Cell>
        <Cell name="пусто — идеи" wide>{thread({})}</Cell>
        <Cell name="работает" wide>{thread({ job: running('Ставит каркас', 14), now: 14000 })}</Cell>
        <Cell name="долгий старт — объясняем" wide>{thread({ job: { ...running('Думает', 0), steps: [{ kind: 'think', text: 'Думает' }] }, now: 48000 })}</Cell>
        <Cell name="готово" wide>{thread({ job: ended({ result: 'Крышка приподнимается над корпусом при наведении.', changed: true }) })}</Cell>
        <Cell name="готово — печатается, с подсказками" wide>{thread({ job: ended({ result: 'Почтовый ящик на столбе: при наведении флажок поднимается, дверца приоткрывается.', changed: true, next: ['Флажок крупнее', 'Дверцу шире', 'Столб ниже'], at: Date.now() }) })}</Cell>
        <Cell name="остановлено" wide>{thread({ job: ended({ result: 'Остановлено' }) })}</Cell>
        <Cell name="лимит подписки" wide>{thread({ job: ended({ error: { text: 'Лимит подписки Claude закончился — обновится в 2:40', fix: 'api' } }) })}</Cell>
        <Cell name="ключ не подходит" wide>{thread({ job: ended({ error: { text: 'Ключ API не подходит', fix: 'key' } }) })}</Cell>
        <Cell name="слетел вход" wide>{thread({ job: ended({ error: { text: 'Нужно заново войти в Claude', fix: 'login' } }) })}</Cell>
        <Cell name="сбой — ещё раз" wide>{thread({ job: ended({ error: { text: 'Claude сейчас перегружен — попробуйте через минуту', fix: 'retry' } }) })}</Cell>
        <Cell name="история" wide>{thread({ turns: [{ prompt: 'Сейф на плите', result: 'Сейф стоит на плите, дверца приоткрывается.' }, { prompt: 'Сделай ниже', error: { text: 'Нет связи', fix: 'retry' } }] })}</Cell>
      </div>
    </Section>

    <Section id="dock" title="Нижняя панель" lead="Инструменты и строка для Claude в одной полосе. Сверху разворачивается разговор. Пока Claude работает, по верхнему краю бежит линия, а «Отправить» становится «Стоп».">
      <div className="ds-stack">
        {([['покой', null, false], ['выделены блоки', <Chip mono icon={<Box size={12} />}>2 блока</Chip>, false], ['с нуля', <Chip tone="ink">С нуля</Chip>, false], ['Claude работает', null, true]] as const).map(([name, chip, busy]) => (
          <Cell key={name} name={name} wide><Stage>
            <div className={`dock ds-inline${busy ? ' is-running' : ''}`}><div className="dock-body">
              {busy && <div className="dock-scan" aria-hidden />}
              <div className="dock-bar">
                <Segmented label="Инструмент" size="lg" tone="ink" value="move" onChange={noop}
                  options={TOOLS} />
                <span className="dock-sep" />
                <div className="dock-input">
                  {chip}
                  <div className="dock-field"><textarea rows={1} readOnly placeholder={busy ? 'Claude работает' : 'Добавь крышку, которая приподнимается'} disabled={busy} /></div>
                  <button className="dock-send" aria-label={busy ? 'Остановить' : 'Отправить'} disabled={!busy}>{busy ? '■' : '↵'}</button>
                </div>
              </div>
            </div></div>
          </Stage></Cell>
        ))}
      </div>
    </Section>

    <Section id="motion-tool" title="Движение" lead="Вкладка «Наведение»: кривая под общепринятым именем (Ease in-out, Ease out) и задержки — полоски тянутся мышью, ▶ проигрывает на холсте и в карточке, волна раздаёт задержки сзади вперёд. Всё в пределах того, что играет сайт.">
      <div className="ds-row">
        <Stage className="ds-panel-stage"><aside className="panel right surface ds-panel ds-motion-panel">
          <Easing editor={editor({ scene, change: noop })} />
          <Timeline editor={editor({ scene: layered(s => ({ ...s, objects: s.objects.map((p, i) => i >= 2 && i <= 4 ? { ...p, hover: { d: 40 }, delay: (i - 2) * .08 } : p) })), selection: [], scrub: .32, setScrub: noop })} onPlay={noop} />
        </aside></Stage>
      </div>
    </Section>

    <Section id="canvas" title="Холст" lead="Пустой холст — призрак блока и три идеи для Claude. Сверху по центру — чип режима: наведение (ink) или подсказка инструмента (стекло).">
      <div className="ds-row">
        <Stage height={220}><div className="canvas-empty ds-static">
          <svg className="canvas-empty-ghost" width="120" height="80" viewBox="-60 -50 120 80" aria-hidden><path d="M0 -40 L40 -20 L0 0 L-40 -20Z M-40 -20 V10 L0 30 L40 10 V-20 M0 0 V30" /></svg>
          <div className="ideas">{IDEAS.slice(0, 2).map(s => <Button key={s} variant="glass">{s}</Button>)}</div>
        </div></Stage>
        <Stage height={220}>
          <div className="mode-chip ds-static"><i />Состояние при наведении</div>
          <div className="mode-chip is-quiet ds-static">Тяните по полу или по верху блока</div>
        </Stage>
      </div>
    </Section>

    <Section id="tiles" title="Плитки сцен" lead="Галерея и первый экран: сцена в кадре карточки сайта; при наведении — рамка ink и движение сцены.">
      <div className="tiles is-compact ds-tiles">
        <button className="tile"><div className="tile-art tile-blank tile-agent"><ClaudeMark size={22} /></div><span>Собрать с Claude</span></button>
        <button className="tile" disabled><div className="tile-art tile-blank tile-agent"><ClaudeMark size={22} /></div><span>Выключена</span></button>
        <button className="tile"><div className="tile-art tile-blank"><Plus size={20} /></div><span>Пустой</span></button>
        <button className="tile"><div className="tile-art"><CardPreview scene={scene} /></div><span>{scene.title}</span></button>
        <button className="tile is-current"><div className="tile-art"><CardPreview scene={scene} /></div><span>Открытый файл</span></button>
      </div>
    </Section>

    <Section id="system" title="Загрузка и сбой" lead="Пока файлы читаются — спиннер с подписью (появляется через 0,3 с, чтобы не мигать). Если интерфейс упал — что случилось, что файлы целы, и два действия.">
      <div className="ds-row">
        <Stage height={140}><div className="loading ds-static"><Spinner />Открываем файлы</div></Stage>
        <Stage><div className="crash ds-static">
          <h2>Что-то сломалось</h2>
          <p>Файлы сохраняются при каждой правке — после перезагрузки всё будет на месте. Если повторяется, пришлите текст ниже.</p>
          <pre>Cannot read properties of undefined (reading 'objects')</pre>
          <div className="row"><Button variant="primary">Перезагрузить</Button><Button variant="quiet">Скопировать ошибку</Button></div>
        </div></Stage>
      </div>
      <States label="История и тема">
        <Cell name="история"><div className="history surface ds-inline"><IconButton size="lg" label="Отменить"><Undo2 size={17} /></IconButton><IconButton size="lg" label="Вернуть"><Redo2 size={17} /></IconButton></div></Cell>
        <Cell name="тема · скачать"><div className="top-actions ds-inline"><IconButton size="lg" variant="glass" label="Тёмная тема"><Moon size={16} /></IconButton><Button variant="primary" size="lg" icon={<Download size={16} />}>Скачать</Button></div></Cell>
        <Cell name="инструменты"><div className="tool-row ds-w2"><IconButton variant="field" label="На опору"><ArrowDownToLine size={14} /></IconButton><IconButton variant="field" label="Повторить" pressed><CopyPlus size={14} /></IconButton><IconButton variant="field" label="Отразить"><FlipHorizontal2 size={14} /></IconButton></div></Cell>
      </States>
    </Section>
  </>;
}

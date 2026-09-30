import { useEffect, useRef, useState } from 'react';
import { KeyRound, LogIn, RotateCcw, TerminalSquare, Undo2 } from 'lucide-react';
import type { JobState } from '../ai/claude';
import type { Fix, Problem } from '../ai/errors';
import type { Turn } from '../ai/talks';
import type { Editor } from '../editor';
import { Button, Dot, Notice, Spinner } from './kit';

const STOPPED = 'Остановлено';
const FIXES: Record<Exclude<Fix, 'retry'>, { label: string; Icon: typeof KeyRound }> = {
  api: { label: 'Ключ API', Icon: KeyRound },
  key: { label: 'Другой ключ', Icon: KeyRound },
  login: { label: 'Войти', Icon: LogIn },
  install: { label: 'Установить', Icon: TerminalSquare },
};

// Claude's answer types itself out, quick and even: about 30 ms a letter,
// never more than a second and a half in all.
function Typed({ text, still, onDone }: { text: string; still?: boolean; onDone?: () => void }) {
  const [n, setN] = useState(still ? text.length : 0);
  useEffect(() => {
    if (still || matchMedia('(prefers-reduced-motion: reduce)').matches) { setN(text.length); onDone?.(); return; }
    const step = Math.min(30, 1500 / Math.max(1, text.length));
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const shown = Math.min(text.length, Math.floor((now - start) / step));
      setN(shown);
      if (shown < text.length) frame = requestAnimationFrame(tick); else onDone?.();
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text]);
  return <>{text.slice(0, n)}{n < text.length && <i className="type-caret" aria-hidden />}<span className="visually-hidden">{text.slice(n)}</span></>;
}

// The conversation in the dock, wired to the editor.
// `actions`: things Claude can do with the scene as it is (review, tidy), offered beside the ideas.
export function Thread({ editor, ideas, onAsk, actions = [] }: { editor: Editor; ideas: string[]; onAsk: (text: string) => void; actions?: { label: string; run: () => void }[] }) {
  const { claude } = editor, { connection: c } = claude;
  const fix = (f: Fix) => {
    if (f === 'api') c.choose('api');
    if (f === 'key') { c.choose('api'); c.forgetKey(); }
    if (f === 'login') c.switchAccount();
    if (f === 'install') c.refresh();
  };
  return <ThreadView thread={claude.thread} job={claude.job} checking={!c.ready && !c.need} ideas={ideas} actions={actions}
    onAsk={onAsk} onRetry={prompt => claude.generate(prompt)} onFix={fix} onUndo={() => { editor.undo(); claude.dismiss(); }} />;
}

// What the conversation shows: ideas while it's empty, past turns, then the
// run going now with its latest step and a timer, or how it ended and what
// to do next. Pure, so /design.html can show every state.
export function ThreadView({ thread, job, checking, ideas, actions = [], onAsk, onRetry, onFix, onUndo, now: fixedNow }: {
  thread: Turn[]; job: JobState | null; checking?: boolean; ideas: string[]; actions?: { label: string; run: () => void }[];
  onAsk: (text: string) => void; onRetry: (prompt: string) => void; onFix: (fix: Fix) => void; onUndo: () => void; now?: number;
}) {
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' }); }, [thread.length, job?.steps.length, job?.running]);
  // A second hand for the running timer.
  const [tick, setTick] = useState(Date.now());
  useEffect(() => {
    if (!job?.running || fixedNow) return;
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [job?.running, fixedNow]);
  const now = fixedNow ?? tick;
  // The next steps come once the answer has typed itself out.
  const [typed, setTyped] = useState<number | null>(null);

  // The one way out of each problem; a retry is always there too.
  const failed = (error: Problem, prompt: string) => {
    const fix = error.fix !== 'retry' ? FIXES[error.fix] : null;
    return (
      <Notice tone="error" action={<>
        {fix && <Button size="sm" onClick={() => onFix(error.fix)} icon={<fix.Icon size={12} />}>{fix.label}</Button>}
        <Button size="sm" onClick={() => onRetry(prompt)} icon={<RotateCcw size={12} />}>Ещё раз</Button>
      </>}>{error.text}</Notice>
    );
  };
  const last = job && !job.running && thread.at(-1)?.prompt === job.prompt;
  // 20 s in and the scene itself not yet written: say what's going on and for how long.
  const sketched = !!job?.steps.some(st => st.text === 'Набрасывает форму');
  const slow = !!job?.running && now - job.at > 20000 && !job.steps.some(st => /каркас|сцену|блоки|деталь|превью/i.test(st.text));

  return (
    <div className="thread" ref={log} aria-live="polite">
      {!thread.length && !job && (checking
        ? <div className="thread-checking"><Spinner size={13} />Проверяем Claude Code на этом компьютере</div>
        : <div className="ideas">
            {actions.map(a => <Button key={a.label} className="is-action" onMouseDown={e => e.preventDefault()} onClick={a.run}>{a.label}</Button>)}
            {ideas.slice(0, actions.length ? 2 : 3).map(x => <Button key={x} onMouseDown={e => e.preventDefault()} onClick={() => onAsk(x)}>{x}</Button>)}
          </div>)}
      {thread.slice(0, last ? -1 : undefined).slice(-6).map((t, i) => (
        <div key={i} className="turn">
          <p className="turn-you">{t.prompt}</p>
          {t.error ? <p className="turn-past-error">{t.error.text}</p> : <p className={`turn-claude${t.result === STOPPED ? ' is-muted' : ''}`}>{t.result}</p>}
        </div>
      ))}
      {job && (
        <div className="turn is-current">
          <p className="turn-you">{job.prompt}</p>
          {job.running && slow && <p className="turn-hint">{sketched
            ? 'На холсте — быстрый набросок. Claude продумывает сцену целиком, обычно 2–4 минуты; потом один раз сверит её с превью.'
            : 'Придумывает образ — это самый долгий шаг, обычно 1–3 минуты. Блоки появятся на холсте, как только начнётся запись.'}</p>}
          {job.running
            ? <div className="turn-live">
                <Dot live />
                <span key={job.steps.length}>{job.steps.filter(s => s.kind !== 'text').at(-1)?.text ?? 'Начинает'}</span>
                <em>{Math.max(0, Math.round((now - job.at) / 1000))}{' '}с</em>
              </div>
            : job.error
              ? failed(job.error, job.prompt)
              : <>
                  <div className="turn-end"><p className={`turn-claude${job.result === STOPPED ? ' is-muted' : ''}`}><Typed key={job.at} text={job.result ?? ''} still={!!fixedNow} onDone={() => setTyped(job.at)} /></p>
                    {job.changed && <Button size="sm" onClick={onUndo} icon={<Undo2 size={12} />}>Отменить</Button>}</div>
                  {!!job.remarks?.length && typed === job.at && <div className="remarks">
                    {job.remarks.map(r => (
                      <div key={r.issue} className="remark"><span>{r.issue}</span>
                        <Button size="sm" onMouseDown={e => e.preventDefault()} onClick={() => onAsk(r.fix)}>{r.fix}</Button></div>
                    ))}
                    {job.remarks.length > 1 && <Button size="sm" variant="primary" onMouseDown={e => e.preventDefault()}
                      onClick={() => onAsk(job.remarks!.map(r => r.fix).join('; '))}>Исправить всё</Button>}
                  </div>}
                  {!!job.next?.length && typed === job.at && <div className="turn-next">{job.next.map((n, i) =>
                    <Button key={n} size="sm" style={{ animationDelay: `${i * .06}s` }} onMouseDown={e => e.preventDefault()} onClick={() => onAsk(n)}>{n}</Button>)}</div>}
                </>}
        </div>
      )}
    </div>
  );
}

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

// The conversation in the dock, wired to the editor.
export function Thread({ editor, ideas, onAsk }: { editor: Editor; ideas: string[]; onAsk: (text: string) => void }) {
  const { claude } = editor, { connection: c } = claude;
  const fix = (f: Fix) => {
    if (f === 'api') c.choose('api');
    if (f === 'key') { c.choose('api'); c.forgetKey(); }
    if (f === 'login') c.switchAccount();
    if (f === 'install') { c.choose('local'); c.refresh(); }
  };
  return <ThreadView thread={claude.thread} job={claude.job} checking={!c.ready && !c.need} ideas={ideas}
    onAsk={onAsk} onRetry={prompt => claude.generate(prompt)} onFix={fix} onUndo={() => { editor.undo(); claude.dismiss(); }} />;
}

// What the conversation shows: ideas while it's empty, past turns, then the
// run going now with its latest step and a timer, or how it ended and what
// to do next. Pure, so /design.html can show every state.
export function ThreadView({ thread, job, checking, ideas, onAsk, onRetry, onFix, onUndo, now: fixedNow }: {
  thread: Turn[]; job: JobState | null; checking?: boolean; ideas: string[];
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

  return (
    <div className="thread" ref={log} aria-live="polite">
      {!thread.length && !job && (checking
        ? <div className="thread-checking"><Spinner size={13} />Проверяем Claude Code на этом компьютере</div>
        : <div className="ideas">{ideas.slice(0, 3).map(x => <Button key={x} onMouseDown={e => e.preventDefault()} onClick={() => onAsk(x)}>{x}</Button>)}</div>)}
      {thread.slice(0, last ? -1 : undefined).slice(-6).map((t, i) => (
        <div key={i} className="turn">
          <p className="turn-you">{t.prompt}</p>
          {t.error ? <p className="turn-past-error">{t.error.text}</p> : <p className={`turn-claude${t.result === STOPPED ? ' is-muted' : ''}`}>{t.result}</p>}
        </div>
      ))}
      {job && (
        <div className="turn is-current">
          <p className="turn-you">{job.prompt}</p>
          {job.running
            ? <div className="turn-live">
                <Dot live />
                <span key={job.steps.length}>{job.steps.filter(s => s.kind !== 'text').at(-1)?.text ?? 'Начинает'}</span>
                <em>{Math.max(0, Math.round((now - job.at) / 1000))}{' '}с</em>
              </div>
            : job.error
              ? failed(job.error, job.prompt)
              : <div className="turn-end"><p className={`turn-claude${job.result === STOPPED ? ' is-muted' : ''}`}>{job.result}</p>
                  {job.changed && <Button size="sm" onClick={onUndo} icon={<Undo2 size={12} />}>Отменить</Button>}</div>}
        </div>
      )}
    </div>
  );
}

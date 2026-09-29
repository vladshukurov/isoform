import { useEffect, useRef, useState } from 'react';
import { KeyRound, LogIn, RotateCcw, TerminalSquare, Undo2 } from 'lucide-react';
import type { Fix, Problem } from '../ai/errors';
import type { Editor } from '../editor';

const STOPPED = 'Остановлено';

// The conversation in the dock: past turns, then the run going now with its
// latest step and a timer, or how it ended and what to do next.
export function Thread({ editor, ideas, onAsk }: { editor: Editor; ideas: string[]; onAsk: (text: string) => void }) {
  const { claude } = editor, { job, thread, connection } = claude;
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' }); }, [thread.length, job?.steps.length, job?.running]);
  // A second hand for the running timer.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!job?.running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [job?.running]);

  // The one way out of each problem; a retry is always there too.
  const fixes: Record<Exclude<Fix, 'retry'>, { label: string; Icon: typeof KeyRound; run: () => void }> = {
    api: { label: 'Ключ API', Icon: KeyRound, run: () => connection.choose('api') },
    key: { label: 'Другой ключ', Icon: KeyRound, run: () => { connection.choose('api'); connection.forgetKey(); } },
    login: { label: 'Войти', Icon: LogIn, run: () => { connection.choose('local'); connection.switchAccount(); } },
    install: { label: 'Установить', Icon: TerminalSquare, run: () => { connection.choose('local'); connection.refresh(); } },
  };
  const failed = (error: Problem, prompt: string) => {
    const fix = error.fix !== 'retry' ? fixes[error.fix] : null;
    return (
      <div className="turn-end">
        <p className="turn-error">{error.text}</p>
        <div className="turn-actions">
          {fix && <button className="chip-button" onClick={fix.run}><fix.Icon size={12} />{fix.label}</button>}
          <button className="chip-button" onClick={() => claude.generate(prompt)}><RotateCcw size={12} />Ещё раз</button>
        </div>
      </div>
    );
  };
  const last = job && !job.running && thread.at(-1)?.prompt === job.prompt;

  return (
    <div className="thread" ref={log} aria-live="polite">
      {!thread.length && !job && <div className="thread-empty">
        <div className="ideas">{ideas.slice(0, 3).map(x => <button key={x} className="idea" onMouseDown={e => e.preventDefault()} onClick={() => onAsk(x)}>{x}</button>)}</div>
      </div>}
      {thread.slice(0, last ? -1 : undefined).slice(-6).map((t, i) => (
        <div key={i} className="turn">
          <p className="turn-you">{t.prompt}</p>
          {t.error ? <p className="turn-error">{t.error.text}</p> : <p className={`turn-claude${t.result === STOPPED ? ' is-muted' : ''}`}>{t.result}</p>}
        </div>
      ))}
      {job && (
        <div className="turn is-current">
          <p className="turn-you">{job.prompt}</p>
          {job.running
            ? <div className="turn-live">
                <i className="live-dot" />
                <span key={job.steps.length}>{job.steps.filter(s => s.kind !== 'text').at(-1)?.text ?? 'Начинает'}</span>
                <em>{Math.max(0, Math.round((now - job.at) / 1000))}{' '}с</em>
              </div>
            : job.error
              ? failed(job.error, job.prompt)
              : <div className="turn-end"><p className={`turn-claude${job.result === STOPPED ? ' is-muted' : ''}`}>{job.result}</p>
                  {job.changed && <button className="chip-button" onClick={() => { editor.undo(); claude.dismiss(); }}><Undo2 size={12} />Отменить</button>}</div>}
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { AudioWaveform, Play } from 'lucide-react';
import { ENTER } from '../anim';
import type { Editor } from '../editor';
import { hoverKind } from '../model';

const round = (v: number) => Math.max(0, +(Math.round(v / .02) * .02).toFixed(2));

// When each animated block starts and how long it runs; drag a bar to
// change its delay. ▶ plays the hover on the preview card.
export function Timeline({ editor, onPlay, playing }: { editor: Editor; onPlay: (seconds: number) => void; playing: number | null }) {
  const { scene, selection } = editor;
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; x: number; start: number; moved: boolean } | null>(null);
  const [now, setNow] = useState(0);
  const animated = (scene?.objects ?? []).filter(p => !p.hidden && hoverKind(p) !== 'rest');
  const total = Math.max(1.2, Math.max(0, ...animated.map(p => p.delay ?? 0)) + ENTER + .1);

  // Playhead while the preview plays.
  useEffect(() => {
    if (playing === null) return setNow(0);
    let frame = 0;
    const tick = () => { setNow((performance.now() - playing) / 1000); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  if (!animated.length) return null;
  const pct = (seconds: number) => `${seconds / total * 100}%`;

  return (
    <section className="timeline">
      <div className="section-head">
        <h3>Таймлайн</h3>
        <div className="row">
          <button className="icon" aria-label="Волна задержек" data-tip={selection.length ? 'Волна задержек по выделенным' : 'Волна задержек сзади вперёд'}
            onClick={() => editor.stagger()}><AudioWaveform size={13} /></button>
          <button className="icon" aria-label="Проиграть" data-tip="Проиграть на превью" onClick={() => onPlay(total)}><Play size={13} /></button>
        </div>
      </div>
      <div className="timeline-rows" ref={track}>
        {playing !== null && now <= total && <div className="playhead" style={{ left: `calc(80px + (100% - 80px) * ${now / total})` }} />}
        {animated.map(p => (
          <div key={p.id} className={`timeline-row${selection.includes(p.id) ? ' is-selected' : ''}`}
            onClick={e => editor.setSelection(e.shiftKey || e.metaKey ? [...new Set([...selection, p.id])] : [p.id])}>
            <span className="timeline-name">{p.id}</span>
            <div className="timeline-track">
              <div className="timeline-bar" style={{ left: pct(p.delay ?? 0), width: pct(ENTER) }}
                onClick={e => e.stopPropagation()}
                onPointerDown={e => {
                  e.stopPropagation();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  drag.current = { id: p.id, x: e.clientX, start: p.delay ?? 0, moved: false };
                }}
                onPointerMove={e => {
                  const d = drag.current, el = e.currentTarget.parentElement;
                  if (!d || !el) return;
                  const dx = e.clientX - d.x;
                  if (!d.moved && Math.abs(dx) < 2) return;
                  if (!d.moved) { d.moved = true; editor.checkpoint(); }
                  const delay = round(d.start + dx / el.clientWidth * total);
                  editor.updatePiece(d.id, { delay: delay || undefined }, false);
                }}
                onPointerUp={() => { drag.current = null; }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

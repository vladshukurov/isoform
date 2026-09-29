// The motion tool on the Hover tab, kept small: the easing under its usual
// name, and a timeline of delays with play and a wave. Everything stays
// inside what the site plays: one easing per scene, a fixed duration per
// block (ENTER) and a delay per block.
import { useEffect, useRef, useState } from 'react';
import { AudioWaveform, Play, Square } from 'lucide-react';
import { ease, ENTER } from '../anim';
import type { Editor } from '../editor';
import { hoverKind, type Motion } from '../model';
import { IconButton, Segmented } from './kit';

const round = (v: number) => Math.max(0, +(Math.round(v / .02) * .02).toFixed(2));

// The curve of each easing, small, as a label.
const Curve = ({ motion }: { motion: Motion }) => (
  <svg className="curve" width="18" height="12" viewBox="0 0 18 12" aria-hidden>
    <polyline points={Array.from({ length: 17 }, (_, i) => `${1 + i},${11 - ease[motion](i / 16) * 10}`).join(' ')} />
  </svg>
);

export function Easing({ editor }: { editor: Editor }) {
  const { scene } = editor;
  if (!scene) return null;
  return (
    <section>
      <h3>Кривая</h3>
      <Segmented label="Кривая движения" wide value={scene.motion} onChange={motion => editor.change(s => ({ ...s, motion }))}
        options={[
          { value: 'mechanical', label: <><Curve motion="mechanical" />Ease in-out</>, tip: 'Плавный старт и мягкая остановка — ящики, крышки, тумблеры' },
          { value: 'layered', label: <><Curve motion="layered" />Ease out</>, tip: 'Быстрый старт и долгая доводка; на сайте сцена ещё и собирается при появлении' },
        ]} />
    </section>
  );
}

// When each animated block starts: drag a bar to change its delay.
// ▶ plays the hover on the canvas and the card; the wave spreads delays back to front.
export function Timeline({ editor, onPlay }: { editor: Editor; onPlay: (seconds: number) => void }) {
  const { scene, selection, scrub } = editor;
  const drag = useRef<{ id: string; x: number; start: number; moved: boolean } | null>(null);
  const [playing, setPlaying] = useState(false);
  const animated = (scene?.objects ?? []).filter(p => !p.hidden && hoverKind(p) !== 'rest');
  const end = Math.max(0, ...animated.map(p => p.delay ?? 0)) + ENTER;
  const total = Math.max(1.2, end + .1);

  // Playing walks the canvas through the hover once, then back to its end state.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const start = performance.now();
    onPlay(end);
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      if (t > end + .2) { setPlaying(false); editor.setScrub(null); return; }
      editor.setScrub(Math.min(t, end));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); editor.setScrub(null); };
  }, [playing]);

  if (!animated.length) return null;
  const pct = (seconds: number) => `${seconds / total * 100}%`;

  return (
    <section className="timeline">
      <div className="section-head">
        <h3>Таймлайн</h3>
        <div className="row">
          <IconButton tip label={selection.length ? 'Волна по выделенным' : 'Волна сзади вперёд'} onClick={() => editor.stagger(.06)}><AudioWaveform size={13} /></IconButton>
          <IconButton label={playing ? 'Остановить' : 'Проиграть'} onClick={() => setPlaying(p => !p)}>
            {playing ? <Square size={11} /> : <Play size={13} />}
          </IconButton>
        </div>
      </div>
      <div className="timeline-rows">
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
              {scrub !== null && <b className="timeline-line" style={{ left: pct(scrub) }} />}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

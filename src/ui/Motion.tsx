// The motion tool on the Hover tab: the character of the motion shown, not
// named; a timeline to scrub and play on the canvas; waves in one click.
// Everything stays inside what the site plays: one ease per scene, a fixed
// duration per block (ENTER), and a delay per block.
import { useEffect, useRef, useState } from 'react';
import { AudioWaveform, Pause, Play, Repeat, X } from 'lucide-react';
import { ease, ENTER } from '../anim';
import type { Editor } from '../editor';
import { hoverKind, type Motion } from '../model';
import type { WaveOrder } from '../ops';
import { IconButton, Segmented } from './kit';
import { Menu } from './Menu';

const round = (v: number) => Math.max(0, +(Math.round(v / .02) * .02).toFixed(2));
const secs = (v: number) => `${v.toFixed(2).replace('.', ',')} с`;

const CHARACTERS: { value: Motion; name: string; text: string }[] = [
  { value: 'mechanical', name: 'Механизм', text: 'Плавный старт, мягкая остановка — ящик, крышка' },
  { value: 'layered', name: 'Раскрытие', text: 'Быстрый выезд, долгая доводка; на сайте ещё и собирается при появлении' },
];

// A dot running the curve, and the curve itself: the difference, seen.
function Curve({ motion, on }: { motion: Motion; on: boolean }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!on) return setT(0);
    let frame = 0, start = performance.now();
    const tick = (now: number) => {
      const p = ((now - start) / 1000) % 1.6;
      setT(Math.min(1, p / ENTER));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [on]);
  const pts = Array.from({ length: 33 }, (_, i) => { const x = i / 32; return `${4 + x * 72},${30 - ease[motion](x) * 24}`; }).join(' ');
  return (
    <svg className="curve" viewBox="0 0 80 34" aria-hidden>
      <polyline points={pts} />
      <circle cx={4 + t * 72} cy={30 - ease[motion](t) * 24} r="2.6" />
      <rect x={4 + ease[motion](t) * 60} y="31.5" width="12" height="2.5" rx="1.25" />
    </svg>
  );
}

export function Character({ editor }: { editor: Editor }) {
  const { scene } = editor;
  const [hover, setHover] = useState<Motion | null>(null);
  if (!scene) return null;
  return (
    <section>
      <h3>Характер движения</h3>
      <div className="characters" role="radiogroup" aria-label="Характер движения">
        {CHARACTERS.map(c => (
          <button key={c.value} role="radio" aria-checked={scene.motion === c.value} className="character"
            onPointerEnter={() => setHover(c.value)} onPointerLeave={() => setHover(null)}
            onClick={() => scene.motion !== c.value && editor.change(s => ({ ...s, motion: c.value }))}>
            <Curve motion={c.value} on={hover === c.value || scene.motion === c.value} />
            <b>{c.name}</b>
            <span>{c.text}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

const WAVES: { order: WaveOrder; label: string }[] = [
  { order: 'back', label: 'Сзади вперёд' }, { order: 'front', label: 'Спереди назад' },
  { order: 'up', label: 'Снизу вверх' }, { order: 'down', label: 'Сверху вниз' }, { order: 'together', label: 'Все сразу' },
];

// When each animated block starts; drag a bar to change its delay. Drag on
// the ruler to see any moment on the canvas; ▶ plays it there and on the card.
export function Timeline({ editor, onPlay }: { editor: Editor; onPlay: (seconds: number) => void }) {
  const { scene, selection, scrub } = editor;
  const tracks = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; x: number; start: number; moved: boolean } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [speed, setSpeed] = useState<'1' | '0.5' | '0.25'>('1');
  const [waves, setWaves] = useState<{ x: number; y: number } | null>(null);
  const [step, setStep] = useState(.06);
  const animated = (scene?.objects ?? []).filter(p => !p.hidden && hoverKind(p) !== 'rest');
  const end = Math.max(0, ...animated.map(p => p.delay ?? 0)) + ENTER;
  const total = Math.max(1.2, end + .1);

  // Playing drives the scrub from 0 to the end, at the chosen speed; a loop starts over.
  useEffect(() => {
    if (!playing) return;
    let frame = 0, start = performance.now();
    onPlay(end / +speed);
    const tick = (now: number) => {
      const t = (now - start) / 1000 * +speed;
      if (t >= end + .25) {
        if (loop) { start = now; onPlay(end / +speed); } else { setPlaying(false); editor.setScrub(null); return; }
      }
      editor.setScrub(Math.min(t, end));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, loop, speed]);
  useEffect(() => () => editor.setScrub(null), []);

  if (!animated.length) return null;
  const pct = (seconds: number) => `${seconds / total * 100}%`;
  const at = (clientX: number) => {
    const r = tracks.current!.getBoundingClientRect();
    return Math.min(end, Math.max(0, (clientX - r.left) / r.width * total));
  };
  const ticks = Array.from({ length: Math.floor(total / .2) + 1 }, (_, i) => +(i * .2).toFixed(1));

  return (
    <section className="timeline">
      <div className="section-head">
        <h3>Таймлайн <span className="timeline-total">{secs(end)}</span></h3>
        <div className="row">
          <IconButton label="Волна задержек" onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setWaves({ x: r.left - 180, y: r.bottom + 6 }); }}><AudioWaveform size={13} /></IconButton>
          <IconButton label="По кругу" pressed={loop} onClick={() => setLoop(l => !l)}><Repeat size={13} /></IconButton>
          <IconButton label={playing ? 'Пауза' : 'Проиграть на холсте'} kbd="Пробел" onClick={() => { if (playing) { setPlaying(false); } else setPlaying(true); }}>
            {playing ? <Pause size={13} /> : <Play size={13} />}
          </IconButton>
        </div>
      </div>
      <div className="timeline-body">
        <span className="timeline-corner">
          <Segmented label="Скорость" size="sm" value={speed} onChange={setSpeed}
            options={[{ value: '1', label: '1×' }, { value: '0.5', label: '½' }, { value: '0.25', label: '¼', tip: 'Замедленно — видно каждую задержку' }]} />
        </span>
        <div className="timeline-ruler" ref={tracks}
          onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); setPlaying(false); editor.setScrub(at(e.clientX)); }}
          onPointerMove={e => { if (e.buttons & 1) editor.setScrub(at(e.clientX)); }}>
          {ticks.map(t => <i key={t} style={{ left: pct(t) }} className={Number.isInteger(t * 2.5) ? 'is-major' : ''} />)}
          {ticks.filter(t => Number.isInteger(t * 2.5)).map(t => <span key={`l${t}`} className="timeline-label" style={{ left: pct(t) }}>{String(t).replace('.', ',')}</span>)}
          {scrub !== null && <b className="timeline-head" style={{ left: pct(scrub) }} />}
        </div>
        {animated.map(p => (
          <div key={p.id} className={`timeline-row${selection.includes(p.id) ? ' is-selected' : ''}`}
            onClick={e => editor.setSelection(e.shiftKey || e.metaKey ? [...new Set([...selection, p.id])] : [p.id])}>
            <span className="timeline-name">{p.id}</span>
            <div className="timeline-track">
              <div className="timeline-bar" style={{ left: pct(p.delay ?? 0), width: pct(ENTER) }} data-tip={`Задержка ${secs(p.delay ?? 0)}`}
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
      {scrub !== null && !playing && <div className="timeline-frame">
        <span>Кадр {secs(scrub)} — так сцена выглядит в этот момент</span>
        <IconButton label="Вернуться к наведению" tip={false} onClick={() => editor.setScrub(null)}><X size={12} /></IconButton>
      </div>}
      {waves && <Menu x={waves.x} y={waves.y} onClose={() => setWaves(null)} header={
        <div className="wave-step"><span>Шаг</span><Segmented label="Шаг волны" size="sm" value={String(step)} onChange={v => setStep(+v)}
          options={[{ value: '0.04', label: '0,04' }, { value: '0.06', label: '0,06' }, { value: '0.08', label: '0,08' }, { value: '0.12', label: '0,12' }]} /></div>}
        items={[{ heading: selection.length ? 'Волна по выделенным' : 'Волна по всем, кто движется' },
          ...WAVES.map(w => ({ label: w.label, onSelect: () => editor.stagger(w.order === 'together' ? 0 : step, undefined, w.order) }))]} />}
    </section>
  );
}

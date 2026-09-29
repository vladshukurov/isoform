import { useEffect, useRef, useState, type ReactNode } from 'react';

type Props = {
  label: ReactNode;
  title?: string;
  // undefined = mixed across the selection
  value: number | undefined;
  step?: number;
  min?: number;
  accent?: boolean;
  onCommit: (value: number) => void;
  // Scrubbing the label: one checkpoint at the start, then live values.
  onScrubStart?: () => void;
  onScrub?: (value: number) => void;
};

const round = (v: number) => +v.toFixed(3);

// A Figma-style field: the label scrubs the value, the input commits on
// Enter or blur, ↑↓ step it (Shift ×5).
export function NumberField({ label, title, value, step = 2, min, accent, onCommit, onScrubStart, onScrub }: Props) {
  const [text, setText] = useState(value === undefined ? '' : String(round(value)));
  const scrub = useRef<{ x: number; start: number; moved: boolean } | null>(null);
  useEffect(() => setText(value === undefined ? '' : String(round(value))), [value]);
  const clamp = (v: number) => min === undefined ? v : Math.max(min, v);

  const commit = () => {
    const v = Number(text.replace(',', '.'));
    if (text.trim() !== '' && Number.isFinite(v) && clamp(v) !== value) onCommit(clamp(v));
    else setText(value === undefined ? '' : String(round(value)));
  };

  return (
    <label className={`num${accent ? ' is-accent' : ''}`} title={title}>
      <span className="num-label"
        onPointerDown={e => {
          if (value === undefined || !onScrub) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          scrub.current = { x: e.clientX, start: value, moved: false };
        }}
        onPointerMove={e => {
          const s = scrub.current;
          if (!s) return;
          const dx = e.clientX - s.x;
          if (!s.moved && Math.abs(dx) < 2) return;
          if (!s.moved) { s.moved = true; onScrubStart?.(); }
          onScrub!(clamp(round(s.start + Math.round(dx / 2) * step * (e.shiftKey ? 5 : 1))));
        }}
        onPointerUp={() => { scrub.current = null; }}>
        {label}
      </span>
      <input value={text} placeholder={value === undefined ? 'Смешано' : undefined} inputMode="decimal"
        onChange={e => setText(e.target.value)} onBlur={commit} onFocus={e => e.target.select()}
        onKeyDown={e => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') { setText(value === undefined ? '' : String(round(value))); (e.target as HTMLInputElement).blur(); }
          if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && value !== undefined) {
            e.preventDefault();
            onCommit(clamp(round(value + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 5 : 1))));
          }
        }} />
    </label>
  );
}

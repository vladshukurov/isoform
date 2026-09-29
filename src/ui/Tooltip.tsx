import { useEffect, useLayoutEffect, useRef, useState } from 'react';

type Tip = { text: string; kbd?: string; rect: DOMRect };

// One Figma-style tooltip for the whole app: any element with data-tip
// (and optional data-kbd) gets it after a short pause; moving between
// tipped elements shows the next one at once.
export function Tooltip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer = 0, warmUntil = 0, current: Element | null = null;
    const hide = () => { clearTimeout(timer); if (current) warmUntil = performance.now() + 600; current = null; setTip(null); };
    const over = (e: PointerEvent) => {
      const el = (e.target as Element).closest?.('[data-tip]');
      if (el === current) return;
      hide();
      if (!el) return;
      current = el;
      const show = () => setTip({ text: el.getAttribute('data-tip')!, kbd: el.getAttribute('data-kbd') ?? undefined, rect: el.getBoundingClientRect() });
      if (performance.now() < warmUntil) show(); else timer = window.setTimeout(show, 550);
    };
    window.addEventListener('pointerover', over);
    window.addEventListener('pointerdown', hide, true);
    window.addEventListener('wheel', hide, true);
    window.addEventListener('keydown', hide, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerover', over);
      window.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('wheel', hide, true);
      window.removeEventListener('keydown', hide, true);
    };
  }, []);

  // Below the element, or above it when there is no room (the bottom tool bar).
  useLayoutEffect(() => {
    if (!tip || !ref.current) return setAt(null);
    const r = ref.current.getBoundingClientRect(), gap = 6;
    const below = tip.rect.bottom + gap + r.height < innerHeight - 8;
    const x = Math.min(Math.max(8, tip.rect.left + tip.rect.width / 2 - r.width / 2), innerWidth - r.width - 8);
    setAt({ x, y: below ? tip.rect.bottom + gap : tip.rect.top - gap - r.height });
  }, [tip]);

  if (!tip) return null;
  return (
    <div ref={ref} className="tooltip" role="tooltip" style={at ? { left: at.x, top: at.y } : { visibility: 'hidden' }}>
      {tip.text}{tip.kbd && <kbd>{tip.kbd}</kbd>}
    </div>
  );
}

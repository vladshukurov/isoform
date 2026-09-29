import { useEffect, useLayoutEffect, useRef, useState } from 'react';

type Tip = { el: Element; text: string; kbd?: string; rect: DOMRect; instant: boolean };
const DELAY = 600, WARM = 800, KEYBOARD = 250;

// One tooltip for the whole app: any element with data-tip (and optional
// data-kbd) gets it.
// - Mouse: after a pause; while one was just shown, the next comes at once
//   and without the entrance, so running along a tool bar reads as one tip moving.
// - Keyboard: on focus from Tab, a little sooner; gone on blur.
// - Never on touch, while a button is held or dragging, over an open menu,
//   or behind a dialog; gone on scroll, wheel, a key, a click or leaving the window.
// - The text follows the element (a button that turns «Проиграть» into
//   «Остановить» says so), and the tip goes when the element goes.
export function Tooltip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const [leaving, setLeaving] = useState<Tip | null>(null);
  const [at, setAt] = useState<{ x: number; y: number; above: boolean } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer = 0, warmUntil = 0, current: Element | null = null, shown: Tip | null = null;
    const blocked = (el: Element) =>
      !!document.querySelector('.menu') || (!!document.querySelector('.backdrop') && !el.closest('.backdrop'));
    const read = (el: Element, instant: boolean): Tip => ({ el, text: el.getAttribute('data-tip')!, kbd: el.getAttribute('data-kbd') ?? undefined, rect: el.getBoundingClientRect(), instant });
    const show = (el: Element, instant: boolean) => {
      if (!el.isConnected || !el.getAttribute('data-tip') || blocked(el)) return;
      shown = read(el, instant);
      setLeaving(null);
      setTip(shown);
    };
    const hide = () => {
      clearTimeout(timer);
      if (shown) { const gone = shown; warmUntil = performance.now() + WARM; setLeaving(gone); setTimeout(() => setLeaving(l => l === gone ? null : l), 100); }
      current = null; shown = null;
      setTip(null);
    };
    const over = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || e.buttons) return;
      const el = (e.target as Element).closest?.('[data-tip]');
      if (el === current) return;
      const warm = performance.now() < warmUntil || !!shown;
      hide();
      if (!el) return;
      current = el;
      if (warm) show(el, true); else timer = window.setTimeout(() => show(el, false), DELAY);
    };
    const focus = (e: FocusEvent) => {
      const el = (e.target as Element).closest?.('[data-tip]');
      if (!el || !(e.target as Element).matches?.(':focus-visible')) return;
      hide();
      current = el;
      timer = window.setTimeout(() => show(el, false), KEYBOARD);
    };
    const blur = () => { if (current && !current.matches(':hover')) hide(); };
    const key = (e: KeyboardEvent) => { if (e.key !== 'Tab' && e.key !== 'Shift') hide(); };
    // The text and place follow the element; a gone element takes its tip along.
    const observer = new MutationObserver(() => {
      if (!shown) return;
      if (!shown.el.isConnected || !shown.el.getAttribute('data-tip')) return hide();
      const next = read(shown.el, true);
      if (next.text !== shown.text || next.kbd !== shown.kbd) { shown = next; setTip(next); }
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-tip', 'data-kbd'] });
    window.addEventListener('pointerover', over);
    window.addEventListener('pointerdown', hide, true);
    window.addEventListener('wheel', hide, { capture: true, passive: true });
    window.addEventListener('scroll', hide, true);
    window.addEventListener('keydown', key, true);
    window.addEventListener('focusin', focus);
    window.addEventListener('focusout', blur);
    window.addEventListener('blur', hide);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener('pointerover', over);
      window.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('wheel', hide, { capture: true } as EventListenerOptions);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('focusin', focus);
      window.removeEventListener('focusout', blur);
      window.removeEventListener('blur', hide);
    };
  }, []);

  // Below the element, or above it when there is no room (the bottom dock);
  // kept inside the window.
  const shown = tip ?? leaving;
  useLayoutEffect(() => {
    if (!shown || !ref.current) return setAt(null);
    const r = ref.current.getBoundingClientRect(), gap = 6;
    const above = shown.rect.bottom + gap + r.height > innerHeight - 8;
    const x = Math.min(Math.max(8, shown.rect.left + shown.rect.width / 2 - r.width / 2), innerWidth - r.width - 8);
    setAt({ x, y: above ? shown.rect.top - gap - r.height : shown.rect.bottom + gap, above });
  }, [shown?.el, shown?.text, shown?.rect.left, shown?.rect.top]);

  if (!shown) return null;
  const cls = ['tooltip', at?.above ? 'is-above' : 'is-below', shown.instant ? 'is-instant' : '', !tip ? 'is-leaving' : ''].filter(Boolean).join(' ');
  return (
    <div ref={ref} className={cls} role="tooltip" style={at ? { left: at.x, top: at.y } : { visibility: 'hidden' }}>
      {shown.text}{shown.kbd && <kbd>{shown.kbd}</kbd>}
    </div>
  );
}

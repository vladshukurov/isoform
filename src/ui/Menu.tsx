import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';

export type MenuItem =
  | { label: string; shortcut?: string; checked?: boolean; disabled?: boolean; danger?: boolean; onSelect: () => void }
  | { heading: string }
  | 'separator';

// A floating menu at a point: context menus and the file menu share it.
// Portalled to <body>, so presses on it never reach the canvas underneath.
export function Menu({ x, y, items, onClose, header, above }: { x: number; y: number; items: MenuItem[]; onClose: () => void; header?: ReactNode; above?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ x, y });
  // Keep the menu inside the window.
  useLayoutEffect(() => {
    const r = ref.current!.getBoundingClientRect();
    // `above`: y is where the menu's bottom edge goes (a button's top).
    const top = above ? y - r.height : y;
    setAt({ x: Math.min(x, innerWidth - r.width - 8), y: Math.max(8, Math.min(top, innerHeight - r.height - 8)) });
  }, [x, y, above]);
  useEffect(() => {
    const close = (e: Event) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    // Arrows walk the items; Enter and Space press the focused one (they are buttons).
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      const items = [...ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []];
      if (!items.length || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      const at = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1
        : at < 0 ? (e.key === 'ArrowDown' ? 0 : items.length - 1) : (at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next].focus();
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', key, true);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  return createPortal(
    <div className="menu" role="menu" ref={ref} style={{ left: at.x, top: at.y }} onContextMenu={e => e.preventDefault()}
      onPointerDown={e => e.stopPropagation()}>
      {header}
      {items.map((item, i) => item === 'separator'
        ? <hr key={i} />
        : 'heading' in item ? <div key={i} className="menu-heading">{item.heading}</div>
        : <button key={i} role={item.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'} aria-checked={item.checked}
            disabled={item.disabled} className={item.danger ? 'is-danger' : undefined}
            onClick={() => { onClose(); item.onSelect(); }}>
            <span className="menu-check">{item.checked && <Check size={12} />}</span>
            <span className="menu-label">{item.label}</span>
            {item.shortcut && <kbd>{item.shortcut}</kbd>}
          </button>)}
    </div>,
    document.body,
  );
}

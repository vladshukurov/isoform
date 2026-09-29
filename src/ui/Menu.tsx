import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';

export type MenuItem =
  | { label: string; shortcut?: string; checked?: boolean; disabled?: boolean; danger?: boolean; onSelect: () => void }
  | 'separator';

// A floating menu at a point: context menus and the file menu share it.
// Portalled to <body>, so presses on it never reach the canvas underneath.
export function Menu({ x, y, items, onClose, header }: { x: number; y: number; items: MenuItem[]; onClose: () => void; header?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ x, y });
  // Keep the menu inside the window.
  useLayoutEffect(() => {
    const r = ref.current!.getBoundingClientRect();
    setAt({ x: Math.min(x, innerWidth - r.width - 8), y: Math.min(y, innerHeight - r.height - 8) });
  }, [x, y]);
  useEffect(() => {
    const close = (e: Event) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', key);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', key);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  return createPortal(
    <div className="menu" ref={ref} style={{ left: at.x, top: at.y }} onContextMenu={e => e.preventDefault()}
      onPointerDown={e => e.stopPropagation()}>
      {header}
      {items.map((item, i) => item === 'separator'
        ? <hr key={i} />
        : <button key={i} disabled={item.disabled} className={item.danger ? 'is-danger' : undefined}
            onClick={() => { onClose(); item.onSelect(); }}>
            <span className="menu-check">{item.checked && <Check size={12} />}</span>
            <span className="menu-label">{item.label}</span>
            {item.shortcut && <kbd>{item.shortcut}</kbd>}
          </button>)}
    </div>,
    document.body,
  );
}

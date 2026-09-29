import { useRef } from 'react';

// A thin drag strip on a panel's inner edge, like Figma's: drag to resize,
// double-click to reset.
export function PanelResizer({ side, width, onWidth }: { side: 'left' | 'right'; width: number; onWidth: (w: number) => void }) {
  const start = useRef<{ x: number; w: number } | null>(null);
  return (
    <div className={`resizer resizer-${side}`} role="separator" aria-orientation="vertical"
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); start.current = { x: e.clientX, w: width }; }}
      onPointerMove={e => {
        if (!start.current) return;
        const dx = e.clientX - start.current.x;
        onWidth(Math.min(420, Math.max(200, start.current.w + (side === 'left' ? dx : -dx))));
      }}
      onPointerUp={() => { start.current = null; }}
      onDoubleClick={() => onWidth(240)} />
  );
}

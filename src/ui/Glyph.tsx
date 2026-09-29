import { faces, outline, path, project, vertices } from '../geometry';
import type { Box } from '../model';

// A block drawn in miniature at its own proportions, for the layer rows
// and the mark: the same iso projection as the canvas, fitted to the box.
export function Glyph({ box, size = 18, className }: { box: Pick<Box, 'w' | 'd' | 'h'>; size?: number; className?: string }) {
  // Very thin plates and slabs still read as a shape.
  const k = 10 / Math.max(box.w, box.d, box.h);
  const b = { x: 0, y: 0, z: 0, w: Math.max(box.w * k, 1.4), d: Math.max(box.d * k, 1.4), h: Math.max(box.h * k, 1.4) };
  const pts = vertices(b).map(project);
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0, m = Math.max(w, h) * .12;
  const side = Math.max(w, h) + m * 2;
  return (
    <svg className={`glyph${className ? ` ${className}` : ''}`} width={size} height={size} aria-hidden
      viewBox={`${x0 - m - (side - w - m * 2) / 2} ${y0 - m - (side - h - m * 2) / 2} ${side} ${side}`}>
      {faces(b).map(f => <path key={f.kind} data-face={f.kind} d={path(f.points)} />)}
      <path data-edge="outline" d={outline(b)} />
    </svg>
  );
}

// The Isoform mark: one cube, three tones.
export const Mark = ({ size = 18 }: { size?: number }) => <Glyph box={{ w: 10, d: 10, h: 10 }} size={size} className="mark" />;

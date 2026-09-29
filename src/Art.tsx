import type { PointerEvent } from 'react';
import { faces, outline, path } from './geometry';
import type { Box } from './model';

type Props = {
  ids: string[];
  boxes: Box[];
  locked?: Set<string>;
  onPiecePointerDown?: (id: string, event: PointerEvent) => void;
  onPieceEnter?: (id: string) => void;
  onPieceLeave?: (id: string) => void;
};

// Blocks drawn the way the site draws them: faces tagged for CSS shading,
// then a slightly heavier silhouette per block, in painter order.
export function Art({ ids, boxes, locked, onPiecePointerDown, onPieceEnter, onPieceLeave }: Props) {
  return <>{boxes.map((box, i) => {
    const id = ids[i], live = !locked?.has(id);
    return (
      <g key={id} data-object={id} className={live ? undefined : 'is-locked'}
        onPointerDown={live && onPiecePointerDown ? event => onPiecePointerDown(id, event) : undefined}
        onPointerEnter={live && onPieceEnter ? () => onPieceEnter(id) : undefined}
        onPointerLeave={live && onPieceLeave ? () => onPieceLeave(id) : undefined}>
        {faces(box).map(f => <path key={f.kind} data-face={f.kind} d={path(f.points)} />)}
        <path data-edge="outline" d={outline(box)} />
      </g>
    );
  })}</>;
}

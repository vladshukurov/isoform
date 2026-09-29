import type { PointerEvent } from 'react';
import { faces, outline, path } from './geometry';
import type { Box } from './model';

type Props = {
  ids: string[];
  boxes: Box[];
  selected?: Set<string>;
  onPiecePointerDown?: (id: string, event: PointerEvent) => void;
};

// Blocks drawn the way the site draws them: faces tagged for CSS shading,
// then a slightly heavier silhouette per block, in painter order.
export function Art({ ids, boxes, selected, onPiecePointerDown }: Props) {
  return <>{boxes.map((box, i) => (
    <g key={ids[i]} data-object={ids[i]} className={selected?.has(ids[i]) ? 'is-selected' : undefined}
      onPointerDown={onPiecePointerDown && (event => onPiecePointerDown(ids[i], event))}>
      {faces(box).map(f => <path key={f.kind} data-face={f.kind} d={path(f.points)} />)}
      <path data-edge="outline" d={outline(box)} />
    </g>
  ))}</>;
}

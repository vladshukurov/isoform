import { useMemo, useState } from 'react';
import { useHoverBoxes } from './anim';
import { Art } from './Art';
import { ARTBOARD, fit } from './geometry';
import type { Scene } from './model';

// The scene exactly as a card on the site frames it: silhouette-normalised
// scale, the page's 530-unit crop, its colour tokens and hover motion.
export function CardPreview({ scene, hold = false }: { scene: Scene; hold?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const active = hovered || hold;
  const objects = useMemo(() => scene.objects.filter(p => !p.hidden), [scene.objects]);
  const boxes = useHoverBoxes(objects, scene.motion, active);
  const { scale, cx, cy } = useMemo(() => fit(objects), [objects]);
  const c = ARTBOARD / 2;
  return (
    <svg className={`card iso-art${active ? ' is-active' : ''}`} viewBox="35 35 530 530"
      onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
      <g transform={`translate(${c} ${c}) scale(${scale}) translate(${-cx} ${-cy})`}>
        <Art ids={objects.map(p => p.id)} boxes={boxes} />
      </g>
    </svg>
  );
}

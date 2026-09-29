import { useMemo, useState } from 'react';
import { useHoverBoxes } from './anim';
import { Art } from './Art';
import { ARTBOARD, fit } from './geometry';
import type { Scene } from './model';

// The scene exactly as a card on the site frames it: silhouette-normalised
// scale, the page's 530-unit crop, its colour tokens and hover motion.
export function CardPreview({ scene, label, hold = false }: { scene: Scene; label?: string; hold?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const active = hovered || hold;
  const boxes = useHoverBoxes(scene.objects, scene.motion, active);
  const { scale, cx, cy } = useMemo(() => fit(scene.objects), [scene.objects]);
  const c = ARTBOARD / 2;
  return (
    <figure className="card" onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
      <svg className={`iso-art${active ? ' is-active' : ''}`} viewBox="35 35 530 530">
        <g transform={`translate(${c} ${c}) scale(${scale}) translate(${-cx} ${-cy})`}>
          <Art ids={scene.objects.map(p => p.id)} boxes={boxes} />
        </g>
      </svg>
      {label && <figcaption>{label}</figcaption>}
    </figure>
  );
}

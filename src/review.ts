import { hoverBox, type Box, type Scene } from './model';

// Two blocks that share volume draw as one tangled shape in iso.
const overlap = (a: Box, b: Box) => (['x', 'y', 'z'] as const).every((p, i) => {
  const s = (['w', 'd', 'h'] as const)[i];
  return Math.min(a[p] + a[s], b[p] + b[s]) - Math.max(a[p], b[p]) > .01;
});

// What a reviewer would reject before looking at the picture.
export function review(scene: Scene) {
  const blocks = scene.objects.filter(p => !p.hidden);
  const problems: string[] = [];
  if (!blocks.length) problems.push('в сцене нет блоков');
  for (const [state, boxOf] of [['в покое', (p: Box) => p], ['при наведении', hoverBox]] as const)
    for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++)
      if (overlap(boxOf(blocks[i]), boxOf(blocks[j]))) problems.push(`${blocks[i].id} и ${blocks[j].id} пересекаются ${state}`);
  return problems;
}

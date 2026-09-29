// Site export: the exact markup the Passwork page expects. Every face carries
// data-face so the page shades it through CSS tokens; a block whose hover
// changes its size carries data-open (the outline GSAP morphs to); the rest
// silhouette is the hover hit area. Valid XML, so the file also opens on its own.
import { faces, fit, hull, outline, path, project, vertices, ARTBOARD } from './geometry';
import { hoverBox, hoverKind, type Scene } from './model';

// Fallback colours for opening the SVG outside the site; the page overrides them.
const tone = { line: '#a3a9b2', page: '#fafafb' };
const attr = (name: string, value: string | number) => ` ${name}="${value}"`;
const visible = (scene: Scene): Scene => ({ ...scene, objects: scene.objects.filter(p => !p.hidden) });
const escape = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function siteSvg(source: Scene) {
  const scene = visible(source);
  const blocks = scene.objects.map(piece => {
    const open = hoverKind(piece) === 'morph' ? hoverBox(piece) : undefined;
    const openFaces = open ? faces(open) : [];
    const faceMarkup = faces(piece).map((f, i) =>
      `<path data-face="${f.kind}"${attr('d', path(f.points))}${open ? attr('data-open', path(openFaces[i].points)) : ''}${attr('fill', tone.page)}${attr('stroke', tone.line)}/>`).join('');
    const edge = `<path data-edge="outline"${attr('d', outline(piece))}${open ? attr('data-open', outline(open)) : ''} fill="none"${attr('stroke', tone.line)}/>`;
    return `<g data-object="${escape(piece.id)}">${faceMarkup}${edge}</g>`;
  });
  const { scale, cx, cy } = fit(scene.objects);
  const hit = path(hull(scene.objects.flatMap(b => vertices(b).map(project))));
  const body = `<path data-hit="" d="${hit}" fill="none" stroke="none"/>\n` + blocks.join('\n');
  const w = ARTBOARD, h = ARTBOARD;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><title>${escape(scene.title)}</title>`
    + `<g data-iso="" stroke-width="0.85" stroke-linejoin="round" transform="translate(${w / 2} ${h / 2}) scale(${scale.toFixed(4)}) translate(${(-cx).toFixed(2)} ${(-cy).toFixed(2)})">\n${body}\n</g></svg>`;
  return svg.replace(/<path /g, '<path vector-effect="non-scaling-stroke" ');
}

// The hover choreography in the shape of src/motion/isoform-motion.js:
// travelling blocks become pieces, resized ones become morphs.
export function siteMotion(source: Scene) {
  const scene = visible(source);
  const pieces: [string, [number, number, number], { delay: number }][] = [];
  const morphDelay: Record<string, number> = {};
  for (const p of scene.objects) {
    const kind = hoverKind(p), to = hoverBox(p), delay = p.delay ?? 0;
    if (kind === 'move') pieces.push([p.id, [to.x - p.x, to.y - p.y, to.z - p.z], { delay }]);
    if (kind === 'morph') morphDelay[p.id] = delay;
  }
  return { motion: scene.motion, pieces, ...(Object.keys(morphDelay).length ? { morphDelay } : {}) };
}

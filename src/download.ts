import { formatScene } from './format';
import type { Scene } from './model';
import { siteSvg } from './render';

function save(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const downloadSvg = (name: string, scene: Scene) => save(`${name}.svg`, new Blob([siteSvg(scene)], { type: 'image/svg+xml' }));
export const downloadJson = (name: string, scene: Scene) => save(`${name}.scene.json`, new Blob([formatScene(scene)], { type: 'application/json' }));

// The site's colours per theme (passwork ds-tokens.css), baked into the picture.
const THEMES = {
  light: { page: '#fafafb', shade: '#eceef1', edge: '#b9bec6', line: '#8e959f' },
  dark: { page: '#26282c', shade: '#1e2023', edge: '#3d4148', line: '#585e67' },
};

// A PNG of the card as the site shows it: the 530-unit crop on the page colour.
export async function downloadPng(name: string, scene: Scene, theme: 'light' | 'dark', scale = 2) {
  const t = THEMES[theme], size = 530 * scale;
  // Strokes don't scale with the drawing (non-scaling-stroke), so widen them with the image.
  const style = `<style>path{stroke:${t.edge};stroke-width:${.75 * scale};stroke-linejoin:round}`
    + `path[data-edge]{fill:none;stroke:${t.line};stroke-width:${1.1 * scale}}`
    + `path[data-face=top],path[data-face=left]{fill:${t.page}}path[data-face=right]{fill:${t.shade}}path[data-hit]{fill:none;stroke:none}</style>`;
  const svg = siteSvg(scene)
    .replace(/ (fill|stroke)="#[0-9a-f]{6}"/g, '')
    .replace('width="600" height="600" viewBox="0 0 600 600">',
      `width="${size}" height="${size}" viewBox="35 35 530 530">${style}<rect x="35" y="35" width="530" height="530" fill="${t.page}"/>`);
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
  canvas.getContext('2d')!.drawImage(image, 0, 0, size, size);
  const blob = await new Promise<Blob | null>(done => canvas.toBlob(done, 'image/png'));
  if (blob) save(`${name}.png`, blob);
}

// Opens a .json dropped on the window or picked in the menu.
export async function readSceneFile(file: File) {
  const text = await file.text();
  return { text, name: file.name.replace(/(\.scene)?\.json$/i, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'imported' };
}

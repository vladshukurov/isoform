import { formatScene } from './format';
import type { Scene } from './model';
import { siteSvg } from './render';

function save(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const downloadSvg = (name: string, scene: Scene) => save(`${name}.svg`, siteSvg(scene), 'image/svg+xml');
export const downloadJson = (name: string, scene: Scene) => save(`${name}.scene.json`, formatScene(scene), 'application/json');

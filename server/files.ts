// Scenes live as files in scenes/, so they are versioned with the project;
// exports go straight into the site's art folder.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatScene } from '../src/format';
import { validateScene, type Scene } from '../src/model';
import { siteSvg } from '../src/render';

const root = resolve(import.meta.dirname, '..');
export const scenesDir = resolve(root, 'scenes');
const config = JSON.parse(readFileSync(resolve(root, 'isoform.config.json'), 'utf8')) as { siteArtDir: string };
export const siteArtDir = resolve(root, config.siteArtDir);

export const validName = (name: string) => /^[a-z0-9][a-z0-9-]*$/.test(name);
const check = (name: string) => { if (!validName(name)) throw new Error(`Имя «${name}»: только латиница, цифры и дефис`); };

export function listScenes() {
  return readdirSync(scenesDir).filter(f => f.endsWith('.json')).sort()
    .map(f => ({ name: f.slice(0, -5), scene: validateScene(JSON.parse(readFileSync(resolve(scenesDir, f), 'utf8'))) }));
}

export function saveScene(name: string, scene: unknown) {
  check(name);
  writeFileSync(resolve(scenesDir, `${name}.json`), formatScene(validateScene(scene)));
}

export function exportScene(name: string, scene?: Scene) {
  check(name);
  const source = scene ?? validateScene(JSON.parse(readFileSync(resolve(scenesDir, `${name}.json`), 'utf8')));
  if (!existsSync(resolve(siteArtDir, '..'))) throw new Error(`Нет папки сайта: ${siteArtDir}`);
  mkdirSync(siteArtDir, { recursive: true });
  const files = [resolve(siteArtDir, `${name}.svg`), resolve(siteArtDir, `${name}.scene.json`)];
  writeFileSync(files[0], siteSvg(source));
  writeFileSync(files[1], formatScene(source));
  return files;
}

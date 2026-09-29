// End-to-end smoke test: a real browser drives the editor against its own
// dev server (port 8792) and checks what lands in files/ on disk.
// Uses only files/smoke-*.json and removes them at the end.
//   npm run smoke            (CHROMIUM_PATH=… to pick the browser)
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = resolve(import.meta.dirname, '..');
const PORT = 8792, BASE = `http://localhost:${PORT}`, NAME = 'smoke-a';
const fileOnDisk = join(root, 'files', `${NAME}.json`);
const started = Date.now();
const log = (...args) => console.log(`[${((Date.now() - started) / 1000).toFixed(1)}s]`, ...args);

// A Chromium already on this machine, so nothing is downloaded.
function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), 'Library', 'Caches', 'ms-playwright');
  if (!existsSync(cache)) return undefined;
  const builds = readdirSync(cache).filter(d => /^chromium-\d+$/.test(d)).sort((a, b) => +b.split('-')[1] - +a.split('-')[1]);
  const inside = [
    'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
    'chrome-linux64/chrome', 'chrome-linux/chrome',
  ];
  for (const build of builds) for (const rel of inside) {
    const path = join(cache, build, rel);
    if (existsSync(path)) return path;
  }
  return undefined;
}

// Poll until check() returns a truthy value (or stops throwing).
async function until(what, check, timeout = 5000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { const v = await check(); if (v) return v; last = undefined; } catch (error) { last = error; }
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error(`Timed out: ${what}${last ? ` (${last.message})` : ''}`);
}
const disk = () => JSON.parse(readFileSync(fileOnDisk, 'utf8'));
const piece = (id, scene = disk()) => scene.objects.find(p => p.id === id);

let server, browser, failed = false;
const errors = [], known = [];
try {
  log('starting vite on', PORT);
  server = await createServer({ root, configFile: join(root, 'vite.config.ts'), logLevel: 'error', server: { port: PORT, strictPort: true, open: false } });
  await server.listen();

  const executablePath = findChromium();
  log('browser', executablePath ?? '(playwright default)');
  browser = await chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', m => { if (m.type() === 'error' && !/favicon/i.test(m.text() + (m.location()?.url ?? ''))) errors.push(`console: ${m.text()}`); });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('response', r => { if (r.status() >= 400 && !/favicon/i.test(r.url())) errors.push(`http ${r.status()}: ${r.url()}`); });

  const canvasSvg = page.locator('.canvas svg.workspace');
  const layer = id => page.locator('.layer', { has: page.locator('.layer-name', { hasText: new RegExp(`^${id}$`) }) });
  const field = label => page.locator('.panel.right .num', { has: page.locator('.num-label', { hasText: new RegExp(`^${label}$`) }) }).locator('input');

  // 1. A file from a template via the API opens with its six blocks.
  log('1. create smoke-a from templates/storage.json and open it');
  const template = JSON.parse(readFileSync(join(root, 'templates', 'storage.json'), 'utf8'));
  const put = await fetch(`${BASE}/api/files/${NAME}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(template) });
  assert.equal(put.status, 200, `PUT failed: ${await put.text()}`);
  await page.goto(`${BASE}/?file=${NAME}`);
  await page.locator('.layer').nth(5).waitFor();
  assert.equal(await page.locator('.layer').count(), 6, 'layers list shows 6 blocks');
  await until('6 blocks on the canvas', async () => await canvasSvg.locator('[data-object]').count() === 6);
  assert.equal(await page.locator('.file-name').textContent(), NAME);

  // 2. Select a layer, type arithmetic into X, autosave writes it.
  log('2. select safe-plinth, X = 120/2');
  await layer('safe-plinth').click();
  await until('safe-plinth selected', () => layer('safe-plinth').evaluate(el => el.classList.contains('is-selected')));
  const x = field('X');
  assert.equal(await x.inputValue(), '-100');
  await x.click();
  await x.fill('120/2');
  await x.press('Enter');
  await until('X shows 60', async () => await x.inputValue() === '60');
  await until('x=60 on disk', () => piece('safe-plinth').x === 60, 3000);

  // 3. Undo restores it, on disk too.
  log('3. ⌘Z restores x');
  await page.keyboard.press('Meta+z');
  await until('X shows -100', async () => await x.inputValue() === '-100');
  await until('x=-100 on disk', () => piece('safe-plinth').x === -100, 3000);

  // 4. Draw a block on the empty floor.
  log('4. draw a block with B');
  await page.keyboard.press('Escape');
  await page.keyboard.press('b');
  await page.locator('[aria-label="Инструмент"] [aria-checked="true"][aria-label^="Блок"]').waitFor();
  const box = await canvasSvg.boundingBox();
  // Clear canvas between the scene and the right panel, under the top bar.
  const from = { x: box.x + box.width - 480, y: box.y + 110 };
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-object], button, .surface, .dock') ? 'busy' : 'free', from);
  assert.equal(hit, 'free', 'the start point of the drag is empty canvas');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 60, from.y + 20, { steps: 6 });
  await page.mouse.move(from.x + 120, from.y + 40, { steps: 6 });
  await page.mouse.up();
  await layer('block').waitFor();
  await until('7 objects on disk with "block"', () => disk().objects.length === 7 && piece('block'), 3000);
  const drawn = piece('block');
  assert.ok(drawn.w >= 10 && drawn.d >= 10, `drawn block has a size: ${JSON.stringify(drawn)}`);

  // 5. Duplicate through the canvas context menu.
  log('5. right-click safe-lid → Дублировать');
  const before = new Set(disk().objects.map(p => p.id));
  const copied = () => { const s = disk(); return s.objects.length === 9 && s.objects.find(p => !before.has(p.id)); };
  const duplicateVia = async target => {
    await target.click({ button: 'right' });
    const menu = page.locator('.menu');
    await menu.waitFor();
    await menu.getByRole('menuitem', { name: /Дублировать/ }).click();
    return menu.waitFor({ state: 'detached', timeout: 1500 }).then(() => true, () => false);
  };
  // The canvas menu once swallowed its own clicks (pointer capture by the canvas).
  assert.ok(await duplicateVia(canvasSvg.locator('[data-object="safe-lid"] [data-face="top"]')), 'canvas menu closes after Дублировать');
  // The same action from the layers panel menu.
  assert.ok(await duplicateVia(layer('safe-lid')), 'layers panel menu closes after Дублировать');
  const copy = await until('a copy of safe-lid on disk', copied, 3000);
  const lid = piece('safe-lid');
  assert.deepEqual([copy.w, copy.d, copy.h], [lid.w, lid.d, lid.h], 'copy has the same size');
  await layer(copy.id).waitFor();
  assert.equal(await page.locator('.layer').count(), 9);

  // 6. The hover tab shows the timeline for the animated drawer.
  log('6. Наведение tab has a timeline');
  await page.getByRole('radio', { name: 'Наведение' }).click();
  await page.locator('.timeline').waitFor();
  assert.deepEqual(await page.locator('.timeline .timeline-name').allTextContents(), ['drawer-2']);
  await page.getByRole('radio', { name: 'Дизайн' }).click();
  await page.locator('.timeline').waitFor({ state: 'detached' });

  // 7. A change written to disk from outside reaches the open page.
  log('7. external change of safe-lid z');
  await layer('safe-lid').click();
  const z = field('Z');
  await until('Z shows 172', async () => await z.inputValue() === '172');
  // Let autosave settle: the page ignores outside changes over unsaved edits.
  const saved = await page.evaluate(() => fetch('/api/files/smoke-a').then(r => r.json()));
  assert.equal(saved.scene.objects.length, 9);
  await page.waitForTimeout(500);
  const scene = disk();
  piece('safe-lid', scene).z = 180;
  writeFileSync(fileOnDisk, JSON.stringify(scene, null, 2));
  await page.locator('.toast', { hasText: 'изменён снаружи' }).waitFor({ timeout: 5000 });
  await until('Z shows 180', async () => await z.inputValue() === '180');

  // 8. Nothing went wrong in the console.
  log('8. no console errors');
  assert.deepEqual(errors, [], 'console errors');

  // 9. The design system page renders every section without errors.
  log('9. /design.html renders');
  await page.goto(page.url().replace(/\/(\?.*)?$/, '/design.html'));
  await page.locator('#system').waitFor();
  assert.ok(await page.locator('.ds-section').count() >= 20, 'design sections');
  assert.deepEqual(errors, [], 'console errors on /design.html');
  if (known.length) console.warn(`\nKNOWN FAILURES (app bugs, not fixed here):\n  ${known.join('\n  ')}\n`);
  log(`PASS in ${((Date.now() - started) / 1000).toFixed(1)}s`);
} catch (error) {
  failed = true;
  console.error('\nFAIL:', error.message);
  if (errors.length) console.error('console errors so far:\n ', errors.join('\n  '));
} finally {
  await browser?.close().catch(() => {});
  await server?.close().catch(() => {});
  for (const f of readdirSync(join(root, 'files')).filter(f => /^smoke-.*\.json$/.test(f))) unlinkSync(join(root, 'files', f));
  process.exitCode = failed ? 1 : 0;
}

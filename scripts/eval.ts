// Runs Claude Code on a fixed set of tasks and puts every result on one page,
// so a change to the prompts can be judged on all of them, not on one lucky run.
//   npm run eval                     all of eval/prompts.json, two at a time
//   npm run eval key-lock,roles      only these
//   npm run eval -- --jobs=4         more at once (spends the limit faster)
//   npm run eval -- --dry            no Claude: series scenes stand in, to check the sandbox and the page
// Each run gets its own sandbox — eval/runs/<time>/ with files/ and previews/
// of its own — so your files and the open editor are never touched.
// Spends your Claude subscription (or API credit): start it on purpose.
import { copyFileSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { readdirSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const jobs = Math.max(1, Number(args.find(a => a.startsWith('--jobs='))?.slice(7)) || 2);
const dry = args.includes('--dry');
// Experiments: another model or effort for every run (the editor's defaults otherwise).
const model = args.find(a => a.startsWith('--model='))?.slice(8);
const effort = args.find(a => a.startsWith('--effort='))?.slice(9) as 'low' | 'medium' | 'high' | undefined;
const sketch = !args.includes('--no-sketch');
// A cap on Claude Code's thinking per turn, in tokens (MAX_THINKING_TOKENS).
const think = args.find(a => a.startsWith('--think='))?.slice(8);
if (think) process.env.MAX_THINKING_TOKENS = think;
const only = args.find(a => !a.startsWith('--'))?.split(',');
const tasks = (JSON.parse(readFileSync(resolve(root, 'eval', 'prompts.json'), 'utf8')) as { id: string; prompt: string }[])
  .filter(t => !only || only.includes(t.id));
if (!tasks.length) { console.error(`Нет таких задач: ${only?.join(', ')}`); process.exit(1); }

// The sandbox: the project by reference, files/ and previews/ its own.
const now = new Date(), two = (n: number) => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}-${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`;
const dir = resolve(root, 'eval', 'runs', stamp);
mkdirSync(resolve(dir, 'files'), { recursive: true });
mkdirSync(resolve(dir, 'previews'), { recursive: true });
// The instructions are copied, not linked: through a link Claude found the
// real project and wrote its scenes there. Code and templates are linked.
for (const file of ['AGENTS.md', 'CLAUDE.md']) copyFileSync(resolve(root, file), resolve(dir, file));
for (const link of ['package.json', 'tsconfig.json', 'node_modules', 'scripts', 'server', 'src', 'templates'])
  if (!existsSync(resolve(dir, link))) symlinkSync(resolve(root, link), resolve(dir, link));
process.env.ISOFORM_WORKSPACE = dir;
// Loaded after the workspace is set: they read it once.
const { launch } = await import('../server/agent');
const { readFile } = await import('../server/files');
const { previewSvg } = await import('../src/preview');
const { review } = await import('../src/review');
const { warnings } = await import('../src/warnings');

type Result = {
  id: string; prompt: string; ok: boolean; said: string; error?: string;
  seconds: number; first?: number; cost?: number; turns?: number; blocks?: number; animated?: number; problems: string[]; notes: string[];
};

async function run(task: { id: string; prompt: string }): Promise<Result> {
  const started = Date.now();
  let said = '', error: string | undefined, cost: number | undefined, turns: number | undefined, first: number | undefined;
  if (dry) {
    const stand = ['storage', 'cicd', 'access', 'personal'][tasks.indexOf(task) % 4];
    writeFileSync(resolve(dir, 'files', `${task.id}.json`), readFileSync(resolve(root, 'templates', `${stand}.json`)));
    said = `Проверка без Claude: templates/${stand}`;
  } else try {
    const { exited } = launch({ file: task.id, prompt: task.prompt, fresh: true, model, effort, sketch }, event => {
      if (event.kind === 'done') ({ text: said, cost, turns } = event);
      // When the first block reached the canvas: what the person waits through.
      if (event.kind === 'scene' && event.objects.length && first === undefined) first = Math.round((Date.now() - started) / 1000);
      if (event.kind === 'error') error = event.text;
    });
    await exited;
  } catch (e) { error = (e as Error).message; }
  const seconds = Math.round((Date.now() - started) / 1000);
  const base = { id: task.id, prompt: task.prompt, said, error, seconds, first, cost, turns };
  try {
    const scene = readFile(task.id);
    writeFileSync(resolve(dir, 'previews', `${task.id}.png`), new Resvg(previewSvg(scene), { font: { loadSystemFonts: false } }).render().asPng());
    const problems = review(scene), notes = warnings(scene);
    return { ...base, ok: !error && !problems.length, blocks: scene.objects.length, animated: scene.objects.filter(p => p.hover).length, problems, notes };
  } catch (e) {
    return { ...base, ok: false, error: error ?? `Сцены нет: ${(e as Error).message}`, problems: [], notes: [] };
  }
}

console.log(`${tasks.length} задач, по ${jobs} одновременно → ${relative(process.cwd(), dir)}`);
const before = new Set(readdirSync(resolve(root, 'files')));
const results: Result[] = [];
const queue = [...tasks];
await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => {
  for (let task = queue.shift(); task; task = queue.shift()) {
    const r = await run(task);
    results.push(r);
    console.log(`${r.ok ? '✓' : '✗'} ${r.id.padEnd(14)} ${String(r.seconds).padStart(4)} с, первый блок ${r.first ?? '—'} с  ${r.blocks ?? '—'} блоков  ${r.cost !== undefined ? `$${r.cost.toFixed(2)}` : ''}  ${r.error ?? r.problems[0] ?? ''}`);
  }
}));
// A guard: a run that wrote into the real files/ is a sandbox leak, and loud.
const leaked = readdirSync(resolve(root, 'files')).filter(f => !before.has(f));
if (leaked.length) console.error(`\n✗ Утечка из песочницы: в files/ появились ${leaked.join(', ')}`);
results.sort((a, b) => tasks.findIndex(t => t.id === a.id) - tasks.findIndex(t => t.id === b.id));

const sum = (f: (r: Result) => number | undefined) => results.reduce((s, r) => s + (f(r) ?? 0), 0);
const summary = {
  at: new Date().toISOString(), tasks: results.length, ok: results.filter(r => r.ok).length,
  minutes: Math.round(sum(r => r.seconds) / 6) / 10, medianSeconds: results.map(r => r.seconds).sort((a, b) => a - b)[results.length >> 1],
  cost: Math.round(sum(r => r.cost) * 100) / 100,
  medianFirst: results.map(r => r.first ?? r.seconds).sort((a, b) => a - b)[results.length >> 1],
  model: model ?? 'по умолчанию', effort: effort ?? 'medium', sketch, think,
};
writeFileSync(resolve(dir, 'report.json'), JSON.stringify({ summary, results }, null, 2));
writeFileSync(resolve(dir, 'index.html'), page(summary, results));
console.log(`\nГотово ${summary.ok} из ${summary.tasks} · медиана ${summary.medianSeconds} с, первый блок ${summary.medianFirst} с · ≈ $${summary.cost} по ценам API · ${summary.model}, ${summary.effort}${sketch ? '' : ', без наброска'}${think ? `, раздумья ≤ ${think}` : ''}`);
console.log(`Отчёт: ${relative(process.cwd(), resolve(dir, 'index.html'))}`);

function page(s: typeof summary, list: Result[]) {
  const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const card = (r: Result) => `
    <article class="${r.ok ? '' : 'is-bad'}">
      ${r.blocks ? `<img src="previews/${r.id}.png" alt="${esc(r.prompt)}">` : '<div class="none">Сцены нет</div>'}
      <h2>${esc(r.prompt)}</h2>
      <p class="meta">${r.id} · ${r.seconds} с · первый блок ${r.first ?? '—'} с${r.cost !== undefined ? ` · $${r.cost.toFixed(2)}` : ''}${r.turns ? ` · ${r.turns} ходов` : ''}${r.blocks ? ` · ${r.blocks} блоков, ${r.animated} движутся` : ''}</p>
      ${r.said ? `<p class="said">${esc(r.said)}</p>` : ''}
      ${[...(r.error ? [r.error] : []), ...r.problems].map(p => `<p class="bad">✗ ${esc(p)}</p>`).join('')}
      ${r.notes.map(p => `<p class="note">! ${esc(p)}</p>`).join('')}
    </article>`;
  return `<!doctype html><meta charset="utf-8"><title>Isoform eval ${stamp}</title>
<style>
  body { margin: 0; padding: 32px; font: 13px/1.45 -apple-system, system-ui, sans-serif; background: #f5f5f7; color: #111; }
  header { display: flex; gap: 24px; align-items: baseline; margin-bottom: 24px; flex-wrap: wrap; }
  h1 { font-size: 20px; margin: 0; } header span { color: #666; }
  main { display: grid; grid-template-columns: repeat(auto-fill, minmax(560px, 1fr)); gap: 20px; }
  article { background: #fff; border-radius: 16px; padding: 12px 16px 16px; box-shadow: 0 0 0 1px rgba(0,0,0,.06); }
  article.is-bad { box-shadow: 0 0 0 1.5px #e5484d; }
  img { width: 100%; border-radius: 10px; display: block; }
  .none { aspect-ratio: 3.1; display: grid; place-items: center; background: #f5f5f7; border-radius: 10px; color: #888; }
  h2 { font-size: 14px; margin: 12px 0 2px; } .meta, .note { color: #777; margin: 2px 0; } .said { margin: 6px 0; } .bad { color: #d4292f; margin: 2px 0; }
</style>
<header><h1>Isoform eval · ${stamp}</h1>
  <span>${s.ok} из ${s.tasks} без ошибок</span><span>медиана ${s.medianSeconds} с, первый блок ${s.medianFirst} с, всего ${s.minutes} мин</span><span>${s.model}, ${s.effort}</span><span>≈ $${s.cost} по ценам API</span>
  <span>кадры: покой · середина наведения · наведение</span></header>
<main>${list.map(card).join('')}</main>`;
}

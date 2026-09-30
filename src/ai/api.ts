// In-editor generation with the user's own Anthropic API key, straight from
// the browser, so it works in the static build too. Claude drafts the scene
// through one tool; each draft is shown live on the canvas, checked, and sent
// back with the three-frame preview until the model is satisfied.
import Anthropic from '@anthropic-ai/sdk';
import guide from '../../AGENTS.md?raw';
import cicd from '../../templates/cicd.json';
import personal from '../../templates/personal.json';
import { formatScene } from '../format';
import { validateScene, type Piece, type Scene } from '../model';
import { previewPng } from '../preview';
import { review } from '../review';
import { warnings } from '../warnings';
import type { Job } from './job';

const MODEL = 'claude-opus-5-5';
const ROUNDS = 5;

const SYSTEM = `${guide}

## Этот режим

Ты работаешь внутри редактора Isoform: терминала и файлов нет. Вместо файла и npm run check / render пиши сцену инструментом write_scene — каждый вызов заменяет сцену целиком, пользователь сразу видит её на холсте, а в ответ приходит проверка и превью: покой, середина наведения, полное наведение. Смотри на превью так же, как на PNG из npm run render. Когда проверка чистая и картинка аккуратная — закончи одним предложением по-русски, что сделано, а второй строкой — «Дальше:» и 2–3 короткие правки этой сцены через « | », каждая до 5 слов. Не спрашивай уточнений: выбери разумное решение сам.

Ты помогаешь только с этой иллюстрацией. Если просьба не про сцену (здоровье, код, погода, что угодно ещё) — не вызывай write_scene, а ответь одной короткой фразой с лёгкой иронией, что ты здесь по иллюстрациям, и предложи, что можно собрать.

Шаблоны серии для сравнения (не повторяй их):

${formatScene(validateScene(cicd))}
${formatScene(validateScene(personal))}`;

const number = { type: 'number' } as const;
const box = { x: number, y: number, z: number, w: number, d: number, h: number };
const TOOL = {
  name: 'write_scene',
  description: 'Записать сцену целиком: заменяет текущую, показывает её пользователю и возвращает проверку и превью.',
  eager_input_streaming: true,
  input_schema: {
    type: 'object' as const,
    properties: {
      title: { type: 'string', description: 'Подпись для экранных читалок, по-русски' },
      motion: { type: 'string', enum: ['mechanical', 'layered'] },
      objects: {
        type: 'array',
        description: 'Блоки в порядке отрисовки, от дальних к ближним',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' }, ...box,
            hover: { type: 'object', properties: box, description: 'Только изменившиеся при наведении значения, абсолютные' },
            delay: { type: 'number', description: 'Секунды до начала движения' },
          },
          required: ['id', 'x', 'y', 'z', 'w', 'd', 'h'],
        },
      },
    },
    required: ['title', 'motion', 'objects'],
  },
};

const complete = (p: Partial<Piece>): p is Piece =>
  typeof p?.id === 'string' && !!p.id && (['x', 'y', 'z', 'w', 'd', 'h'] as const).every(k => Number.isFinite(p[k]))
  && p.w! > 0 && p.d! > 0 && p.h! > 0;

// A scene from the tool input; hover values the model wrote as rest values are dropped later.
function sceneFrom(input: unknown): Scene {
  const i = input as { title?: unknown; motion?: unknown; objects?: unknown };
  return validateScene({ version: 2, title: i?.title, motion: i?.motion, objects: i?.objects });
}

export async function runWithApi(job: Job, key: string) {
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  const intro: Anthropic.Beta.BetaContentBlockParam[] = [{ type: 'text', text: job.prompt }];
  if (job.scene.objects.length) {
    intro.push({ type: 'text', text: `Текущая сцена «${job.scene.title}»:\n${formatScene(job.scene)}` });
    if (job.selection.length) intro.push({ type: 'text', text: `Выделены блоки: ${job.selection.join(', ')}. Задача про них; остальное меняй, только если без этого не выйдет.` });
    intro.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: await previewPng(job.scene) } });
  }
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: intro }];

  for (let round = 0; round < ROUNDS; round++) {
    job.progress({ kind: 'think', text: round ? 'Смотрит на превью' : 'Думает' });
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      thinking: { type: 'adaptive', display: 'summarized' },
      output_config: { effort: 'high' },
      // A declined request is re-run on another model inside the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      tools: [TOOL],
      messages,
    }, { signal: job.signal });

    // Blocks appear on the canvas as the model writes them.
    stream.on('inputJson', (_, snapshot) => {
      const s = snapshot as { title?: string; motion?: string; objects?: Partial<Piece>[] };
      const objects = (s?.objects ?? []).filter(complete);
      if (objects.length) job.draft({ ...job.scene, title: s.title || job.scene.title, objects }, false);
      job.progress({ kind: 'draft', text: `Пишет сцену · ${objects.length}` });
    });
    stream.on('thinking', (_, snapshot) => job.progress({ kind: 'think', text: snapshot.split('\n').filter(Boolean).at(-1)?.slice(0, 140) || 'Думает' }));

    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await stream.finalMessage();
    } catch (error) {
      if (error instanceof Anthropic.APIUserAbortError) throw error;
      // The status goes along so the dock can say what happened (see errors.ts).
      if (error instanceof Anthropic.APIError) throw new Error(`API ${error.status ?? ''}: ${error.message}`);
      // An unparseable tool input: ask again.
      continue;
    }
    if (message.stop_reason === 'refusal') throw new Error('Модель отказалась выполнять запрос');
    const calls = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (!calls.length) {
      const text = message.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map(b => b.text).join(' ').trim();
      return text || 'Готово';
    }
    if (message.stop_reason === 'max_tokens') throw new Error('Ответ модели оборвался — попробуйте задачу попроще');

    messages.push({ role: 'assistant', content: message.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const call of calls) {
      try {
        const scene = sceneFrom(call.input);
        job.draft(scene, true);
        job.progress({ kind: 'check', text: 'Проверяет' });
        const problems = review(scene), notes = warnings(scene);
        const report = [
          problems.length ? `Ошибки:\n${problems.map(p => `✗ ${p}`).join('\n')}` : 'Ошибок нет.',
          notes.length ? `Предупреждения:\n${notes.map(p => `! ${p}`).join('\n')}` : '',
        ].filter(Boolean).join('\n\n');
        results.push({
          type: 'tool_result', tool_use_id: call.id,
          content: [{ type: 'text', text: report }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: await previewPng(scene) } }],
        });
      } catch (error) {
        results.push({ type: 'tool_result', tool_use_id: call.id, is_error: true, content: (error as Error).message });
      }
    }
    messages.push({ role: 'user', content: results });
  }
  return 'Готово: достигнут предел попыток — проверьте сцену';
}

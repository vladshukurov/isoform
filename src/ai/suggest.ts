// What to suggest in the dock: the rotating example in the field and the
// ideas in an empty conversation. Never a fixed list — from what Claude last
// proposed for this file, from the scene itself, or, for a new scene, from a
// pool of Passwork themes in an order of the file's own; never what was
// already asked.
import { hoverKind, type Scene } from '../model';

// New scenes: product ideas that aren't in the series already (no safe,
// no press, no server racks — those are templates).
const IDEAS = [
  'Стопка карточек доступа, верхняя выезжает вперёд',
  'Замок со скобой, скоба поднимается при наведении',
  'Картотека паролей, ящики выдвигаются волной',
  'Ключ входит в скважину при наведении',
  'Почтовый ящик, флажок поднимается',
  'Урна для удалённых паролей, крышка приоткрывается',
  'Телефон на подставке, экран поднимается слоями',
  'Три ступени ролей, поднимаются по очереди',
  'Конвейер импорта, коробки едут волной',
  'Окно браузера, сбоку выдвигается панель',
  'Шкатулка с кодом, крышка откидывается вверх',
  'Турникет доступа, створки расходятся',
  'Жетоны доступа на подставке, верхний поднимается',
  'Ящик экстренного доступа, стекло поднимается',
];

// A stable shuffle: the same file keeps its order, another file gets another.
function shuffled<T>(list: T[], seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const j = Math.abs(h) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function suggest({ scene, selection, fresh, file, asked = [], next = [] }: {
  scene?: Scene; selection: string[]; fresh?: boolean; file: string; asked?: string[]; next?: string[];
}): string[] {
  const seen = new Set(asked.map(a => a.trim().toLowerCase()));
  const fresh_ = (list: string[]) => [...new Set(list)].filter(s => !seen.has(s.toLowerCase()));
  const objects = scene?.objects.filter(p => !p.hidden) ?? [];
  if (fresh || !objects.length) return fresh_(shuffled(IDEAS, file)).slice(0, 6);

  // The selected blocks: what they are and whether they move.
  if (selection.length) {
    const picked = objects.filter(p => selection.includes(p.id));
    const moving = picked.filter(p => hoverKind(p) !== 'rest');
    const out: string[] = [];
    if (!moving.length) out.push('Пусть выезжает вперёд при наведении', 'Пусть поднимается при наведении');
    else out.push('Сделай ход при наведении больше');
    if (picked.length > 1 && moving.length > 1) out.push('Пусть двигаются волной');
    if (picked.length === 1) out.push('Повтори три раза с зазором 10', 'Сделай вдвое тоньше');
    else out.push('Выровняй по высоте', 'Сделай одинакового размера');
    out.push('Сделай крупнее, чтобы читалось сразу');
    return fresh_(out).slice(0, 6);
  }

  // The scene as a whole: Claude's own next steps first, then what the scene lacks.
  const moving = objects.filter(p => hoverKind(p) !== 'rest');
  const out = [...next];
  if (!moving.length) out.push('Добавь движение при наведении');
  else if (moving.length > 2 && new Set(moving.map(p => p.delay ?? 0)).size === 1) out.push('Пусть детали двигаются волной');
  if (objects.length < 8) out.push('Добавь деталей на видимых гранях');
  if (objects.length > 18) out.push('Упрости: убери мелкие детали');
  out.push('Сделай главную деталь крупнее', 'Сделай композицию ниже и шире', 'Добавь крышку с зазором сверху');
  if (!objects.some(p => p.z <= 14 && p.h <= 16 && p.w >= 120)) out.push('Поставь предмет на цоколь');
  return fresh_(out).slice(0, 6);
}

// What went wrong with a run, in the designer's words, and the one thing to
// do about it. Claude Code and the API report in English and in their own
// terms; the dock shows only this.
export type Fix = 'retry' | 'api' | 'key' | 'login' | 'install';
export type Problem = { text: string; fix: Fix };

// «resets 2:40am (Asia/Almaty)» → «2:40»; «resets Oct 3, 5pm» → «Oct 3, 17:00».
function clock(raw: string) {
  return raw.replace(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/gi, (_, h: string, m: string | undefined, half: string) => {
    const hour = (Number(h) % 12) + (half.toLowerCase() === 'pm' ? 12 : 0);
    return `${hour}:${m ?? '00'}`;
  }).trim();
}

const RULES: [RegExp, (m: RegExpMatchArray) => Problem][] = [
  [/hit your [\w\s]*limit[^·]*(?:·\s*resets\s+([^(]+))?/i, m => ({
    text: m[1] ? `Лимит подписки Claude закончился — обновится в ${clock(m[1])}` : 'Лимит подписки Claude закончился',
    fix: 'api',
  })],
  [/credit balance is too low/i, () => ({ text: 'На балансе API закончились деньги — пополните его в console.anthropic.com', fix: 'key' })],
  [/invalid x-api-key|API 401|authentication_error/i, () => ({ text: 'Ключ API не подходит', fix: 'key' })],
  [/please run \/login|not logged in|oauth token (has )?expired|не авторизован|codex login/i, () => ({ text: 'Нужно заново войти в Claude', fix: 'login' })],
  [/claude code не найден|command not found: claude/i, () => ({ text: 'Claude Code не установлен', fix: 'install' })],
  [/codex не найден|command not found: codex/i, () => ({ text: 'Codex не установлен', fix: 'install' })],
  [/API 529|overloaded/i, () => ({ text: 'Claude сейчас перегружен — попробуйте через минуту', fix: 'retry' })],
  [/API 429|rate.?limit/i, () => ({ text: 'Слишком много запросов — попробуйте через минуту', fix: 'retry' })],
  [/API 5\d\d/i, () => ({ text: 'Сбой на стороне Anthropic — попробуйте ещё раз', fix: 'retry' })],
  [/failed to fetch|networkerror|load failed|connection error/i, () => ({ text: 'Нет связи — проверьте интернет и что редактор запущен (npm run dev)', fix: 'retry' })],
];

// `account`: whose subscription ran out — Claude's or ChatGPT's (Codex).
export function explain(message: string, account = 'Claude'): Problem {
  for (const [pattern, make] of RULES) {
    const m = message.match(pattern);
    if (m) { const p = make(m); return { ...p, text: p.text.replace('подписки Claude', `подписки ${account}`).replace('войти в Claude', `войти в ${account}`) }; }
  }
  const text = message.trim().split('\n').at(-1)!.slice(0, 200);
  return { text: text || 'Что-то пошло не так', fix: 'retry' };
}

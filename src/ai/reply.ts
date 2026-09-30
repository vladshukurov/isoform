// Claude's last message: a sentence for the designer and, on a line of its
// own, «Дальше: a | b | c» — edits worth trying next, shown as chips.
// A review: up to three «- what's wrong → the fix» lines, or «Хорошо: why».
export type Remark = { issue: string; fix: string };
export function readReview(text: string): { remarks: Remark[]; good?: string } {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const remarks = lines.filter(l => l.includes('→')).map(l => {
    const [issue, fix] = l.replace(/^[-–—•*]\s*/, '').split('→').map(x => x.trim().replace(/^«|»$/g, ''));
    return { issue, fix };
  }).filter(r => r.issue && r.fix).slice(0, 3);
  const good = lines.find(l => /^хорошо\s*:/i.test(l))?.replace(/^хорошо\s*:\s*/i, '');
  return { remarks, good: remarks.length ? undefined : good ?? lines.join(' ') };
}

export function splitReply(text: string): { text: string; next: string[] } {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const at = lines.findIndex(l => /^дальше\s*:/i.test(l));
  const next = at < 0 ? [] : lines[at].replace(/^дальше\s*:/i, '').split('|').map(s => s.trim().replace(/[.«»"]/g, '')).filter(s => s && s.length <= 48).slice(0, 3);
  const said = (at < 0 ? lines : lines.filter((_, i) => i !== at)).join(' ').trim();
  return { text: said || 'Готово', next };
}

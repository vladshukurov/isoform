// Arithmetic in number fields, as in Figma: "120/2", "(40+8)*3", "1,5".
// A small recursive-descent parser; anything else is rejected, never eval'd.
export function evaluate(input: string): number | undefined {
  const src = input.replace(/,/g, '.').replace(/\s+/g, '');
  if (!src) return undefined;
  let i = 0;
  const peek = () => src[i];
  const number = (): number | undefined => {
    const m = /^\d*\.?\d+(e[+-]?\d+)?/i.exec(src.slice(i));
    if (!m) return undefined;
    i += m[0].length;
    return Number(m[0]);
  };
  const factor = (): number | undefined => {
    if (peek() === '-') { i++; const v = factor(); return v === undefined ? undefined : -v; }
    if (peek() === '+') { i++; return factor(); }
    if (peek() === '(') {
      i++;
      const v = sum();
      if (peek() !== ')') return undefined;
      i++;
      return v;
    }
    return number();
  };
  const product = (): number | undefined => {
    let v = factor();
    while (v !== undefined && (peek() === '*' || peek() === '/')) {
      const op = src[i++], r = factor();
      if (r === undefined) return undefined;
      v = op === '*' ? v * r : v / r;
    }
    return v;
  };
  function sum(): number | undefined {
    let v = product();
    while (v !== undefined && (peek() === '+' || peek() === '-')) {
      const op = src[i++], r = product();
      if (r === undefined) return undefined;
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  const v = sum();
  return v !== undefined && i === src.length && Number.isFinite(v) ? v : undefined;
}

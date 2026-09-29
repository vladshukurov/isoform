// The design system's primitives. Every control in the editor is built from
// these; /design.html shows each one in every state. Styles: src/styles/kit.css.
import { forwardRef, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { Check, CircleAlert, CircleCheck, Copy, Info, LoaderCircle } from 'lucide-react';

type Size = 'sm' | 'md' | 'lg';

// Primary — the one main action in a place; secondary — the usual;
// quiet — beside a primary; danger — destroys; link — a way out in text;
// glass — floats over the canvas.
export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger' | 'link' | 'glass';
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: Size; loading?: boolean; icon?: ReactNode };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, children, className, disabled, type = 'button', ...rest }, ref) {
  return (
    <button ref={ref} type={type} className={['btn', `btn-${variant}`, `is-${size}`, loading && 'is-loading', className].filter(Boolean).join(' ')}
      disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner size={size === 'sm' ? 12 : 14} /> : icon}
      {children !== undefined && <span className="btn-label">{children}</span>}
    </button>
  );
});

// An icon alone: `label` names it for screen readers. A tooltip only where
// the icon doesn't say it all: `tip` (true — the label) and its key.
type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tip?: string | boolean; kbd?: string; pressed?: boolean; size?: Size; variant?: 'plain' | 'field' | 'glass' };
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, tip, kbd, pressed, size = 'sm', variant = 'plain', className, children, type = 'button', ...rest }, ref) {
  return (
    <button ref={ref} type={type} className={['icon-btn', `is-${size}`, `icon-${variant}`, className].filter(Boolean).join(' ')}
      aria-label={label} aria-pressed={pressed} data-tip={tip === true ? label : tip || undefined} data-kbd={tip ? kbd : undefined} {...rest}>
      {children}
    </button>
  );
}
);

// One of a few: a pill slides to the chosen option. `surface` — a raised
// white pill (tabs, modes); `ink` — the chosen one filled (tools).
export type Option<T extends string> = { value: T; label: ReactNode; tip?: string; kbd?: string; aria?: string };
export function Segmented<T extends string>({ options, value, onChange, size = 'md', tone = 'surface', wide, disabled, label }: {
  options: Option<T>[]; value: T; onChange: (value: T) => void; size?: Size; tone?: 'surface' | 'ink'; wide?: boolean; disabled?: boolean; label: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const el = box.current?.querySelector<HTMLElement>(`[data-value="${value}"]`);
    setPill(el ? { x: el.offsetLeft, w: el.offsetWidth } : null);
  }, [value, options.length, wide]);
  return (
    <div ref={box} role="radiogroup" aria-label={label} className={['seg', `is-${size}`, `seg-${tone}`, wide && 'is-wide'].filter(Boolean).join(' ')}>
      {pill && <i className="seg-pill" style={{ transform: `translateX(${pill.x}px)`, width: pill.w }} />}
      {options.map(o => (
        <button key={o.value} type="button" role="radio" data-value={o.value} aria-checked={o.value === value} aria-label={o.aria}
          data-tip={o.tip} data-kbd={o.kbd} disabled={disabled}
          onMouseDown={e => e.preventDefault()} onClick={() => o.value !== value && onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

// A text input. `mono` for keys, codes and numbers; `invalid` when what's in it is wrong.
export const TextField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { mono?: boolean; invalid?: boolean }>(function TextField(
  { mono, invalid, className, ...rest }, ref) {
  return <input ref={ref} className={['field', mono && 'is-mono', invalid && 'is-invalid', className].filter(Boolean).join(' ')} aria-invalid={invalid || undefined} {...rest} />;
});

export const Spinner = ({ size = 14 }: { size?: number }) => <LoaderCircle size={size} className="spin" aria-hidden />;
export const Kbd = ({ children }: { children: ReactNode }) => <kbd className="kbd">{children}</kbd>;
export const Code = ({ children }: { children: ReactNode }) => <code className="code">{children}</code>;

// A status dot: `live` breathes while something is going on.
export const Dot = ({ tone = 'ink', live }: { tone?: 'ink' | 'muted' | 'ok' | 'danger'; live?: boolean }) =>
  <i className={`dot dot-${tone}${live ? ' is-live' : ''}`} aria-hidden />;

// A small label: the selection in the prompt, a badge in the file pill.
export const Chip = ({ children, icon, tone = 'plain', mono }: { children: ReactNode; icon?: ReactNode; tone?: 'plain' | 'ink'; mono?: boolean }) =>
  <span className={`chip chip-${tone}${mono ? ' is-mono' : ''}`}>{icon}<span>{children}</span></span>;

// A message in place: what happened and, when there is one, what to do.
const NOTICE_ICONS = { info: Info, error: CircleAlert, success: CircleCheck };
export function Notice({ tone = 'info', children, action }: { tone?: 'info' | 'error' | 'success'; children: ReactNode; action?: ReactNode }) {
  const Icon = NOTICE_ICONS[tone];
  return (
    <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon size={14} />
      <div className="notice-text">{children}</div>
      {action && <div className="notice-action">{action}</div>}
    </div>
  );
}

// Nothing here yet: what this place is for and how to fill it.
export function EmptyState({ icon, title, children, actions }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <b>{title}</b>
      {children && <p>{children}</p>}
      {actions && <div className="empty-actions">{actions}</div>}
    </div>
  );
}

// Text to copy as is — a command, a config.
export function CopyBlock({ text, mono }: { text: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={`copy${mono ? ' is-mono' : ''}`}>
      <pre>{text}</pre>
      <IconButton label={copied ? 'Скопировано' : 'Скопировать'} onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}>{copied ? <Check size={13} /> : <Copy size={13} />}</IconButton>
    </div>
  );
}

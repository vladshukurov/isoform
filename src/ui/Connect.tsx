import { useState } from 'react';
import { ExternalLink, KeyRound, TerminalSquare } from 'lucide-react';
import type { Connection } from '../ai/connection';
import { ClaudeMark } from './ClaudeMark';
import { Button, CopyBlock, Notice, TextField } from './kit';

export const INSTALL = 'npm install -g @anthropic-ai/claude-code';

// What's missing before Claude can work, one step at a time: install Claude
// Code, sign in to it, or give an API key. Shown in the dock and in the
// onboarding; `onReady` puts the caret back where the person was going.
export function Connect({ connection: c, onReady, focus = true }: { connection: Connection; onReady?: () => void; focus?: boolean }) {
  const [code, setCode] = useState('');
  const [draft, setDraft] = useState('');
  const other = (label: string, engine: 'local' | 'api') =>
    <Button variant="link" onClick={() => c.choose(engine)}>{label}</Button>;

  if (c.need === 'install') return (
    <div className="connect">
      <div className="connect-mark" aria-hidden><TerminalSquare size={16} /></div>
      <div className="connect-text">
        <b>Поставьте Claude Code</b>
        <span>Claude собирает сцены через Claude Code на этом компьютере — по вашей подписке Claude. Одна команда в терминале:</span>
      </div>
      <CopyBlock text={INSTALL} mono />
      <div className="connect-row">
        <Button variant="primary" onClick={c.refresh}>Проверить</Button>
        {other('Или ключ API', 'api')}
      </div>
    </div>
  );

  if (c.need === 'login') return (
    <div className="connect">
      <div className="connect-mark" aria-hidden><ClaudeMark size={20} /></div>
      {c.login.phase === 'code' || c.login.phase === 'checking' ? <>
        <div className="connect-text">
          <b>Остался один шаг</b>
          <span>Подтвердите вход в открывшейся вкладке и вставьте код, который покажет Claude. <a href={c.login.url} target="_blank" rel="noreferrer">Открыть вкладку <ExternalLink size={11} /></a></span>
        </div>
        <form className="connect-code" onSubmit={async e => {
          e.preventDefault();
          if (code.trim() && await c.submitCode(code)) { setCode(''); onReady?.(); }
        }}>
          <TextField autoFocus={focus} mono invalid={!!c.login.error} value={code} onChange={e => setCode(e.target.value)} placeholder="Код подтверждения" spellCheck={false} autoComplete="off" />
          <Button type="submit" variant="primary" disabled={!code.trim()} loading={c.login.phase === 'checking'}>Подключить</Button>
          <Button variant="quiet" onClick={() => { c.cancelLogin(); setCode(''); }}>Отмена</Button>
        </form>
      </> : <>
        <div className="connect-text">
          <b>Войдите в свой Claude</b>
          <span>Опишите идею или правку словами — Claude расставит блоки на холсте, и вы увидите каждый шаг. Работает по вашей подписке.</span>
        </div>
        <div className="connect-row">
          <Button variant="primary" onClick={c.signIn} loading={c.login.phase === 'opening'}>Войти через Claude</Button>
          {other('Или ключ API', 'api')}
        </div>
      </>}
      {c.login.error && <Notice tone="error">{c.login.error}</Notice>}
    </div>
  );

  if (c.need === 'key') return (
    <form className="connect" onSubmit={e => { e.preventDefault(); if (draft.trim()) { c.saveKey(draft); setDraft(''); onReady?.(); } }}>
      <div className="connect-mark" aria-hidden><KeyRound size={16} /></div>
      <div className="connect-text">
        <b>Ключ Anthropic API</b>
        <span>Создайте ключ в <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com <ExternalLink size={11} /></a> — оплата по использованию. Ключ остаётся в этом браузере и уходит только в Anthropic.</span>
      </div>
      <div className="connect-code">
        <TextField type="password" mono autoComplete="off" spellCheck={false} placeholder="sk-ant-…" value={draft} onChange={e => setDraft(e.target.value)}
          invalid={!!draft.trim() && !draft.trim().startsWith('sk-')} />
        <Button type="submit" variant="primary" disabled={!draft.trim().startsWith('sk-')}>Сохранить</Button>
      </div>
      {!!draft.trim() && !draft.trim().startsWith('sk-') && <Notice tone="error">Ключ Anthropic начинается с sk-ant-</Notice>}
      {!c.browserOnly && <div className="connect-row">{other('Или подписка Claude через Claude Code', 'local')}</div>}
    </form>
  );

  return null;
}

import { useState } from 'react';
import { ExternalLink, KeyRound, SquareTerminal, TerminalSquare } from 'lucide-react';
import { ENGINES, type Connection, type EngineId } from '../ai/connection';
import { ClaudeMark } from './ClaudeMark';
import { Button, CopyBlock, Notice, Spinner, TextField } from './kit';

export const INSTALL = ENGINES.local.install!;
// The agent's own mark: Claude's, or a terminal for Codex.
export const EngineMark = ({ engine, size = 20 }: { engine: EngineId; size?: number }) =>
  engine === 'codex' ? <SquareTerminal size={size - 4} /> : engine === 'api' ? <KeyRound size={size - 4} /> : <ClaudeMark size={size} />;

// What's missing before the chosen agent can work, one step at a time:
// install it, sign in, or give an API key — with the other ways as links.
// Shown in the dock and on the first screen; `onReady` puts the caret back.
export function Connect({ connection: c, onReady, focus = true }: { connection: Connection; onReady?: () => void; focus?: boolean }) {
  const [code, setCode] = useState('');
  const [draft, setDraft] = useState('');
  const engine = ENGINES[c.engine];
  const account = engine.account.replace('подписка', 'подписке');
  // The other ways in, as quiet links.
  const others = !c.browserOnly && <>
    {c.engine !== 'local' && <Button variant="link" onClick={() => c.choose('local')}>Или Claude Code</Button>}
    {c.engine !== 'codex' && <Button variant="link" onClick={() => c.choose('codex')}>Или Codex</Button>}
    {c.engine !== 'api' && <Button variant="link" onClick={() => c.choose('api')}>Или ключ API</Button>}
  </>;

  if (c.need === 'install') return (
    <div className="connect">
      <div className="connect-mark" aria-hidden><TerminalSquare size={16} /></div>
      <div className="connect-text">
        <b>Поставьте {engine.name}</b>
        <span>{engine.name} собирает сцены на этом компьютере — по вашей {account}. Одна команда в терминале:</span>
      </div>
      <CopyBlock text={engine.install!} mono />
      <div className="connect-row">
        <Button variant="primary" onClick={c.refresh}>Проверить</Button>
        {others}
      </div>
    </div>
  );

  if (c.need === 'login') return (
    <div className="connect">
      <div className={`connect-mark is-${c.engine}`} aria-hidden><EngineMark engine={c.engine} /></div>
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
      </> : c.login.phase === 'waiting' ? <>
        <div className="connect-text">
          <b>Завершите вход в браузере</b>
          <span>Войдите в ChatGPT в открывшейся вкладке — редактор подхватит сам.{c.login.url && <> <a href={c.login.url} target="_blank" rel="noreferrer">Открыть вкладку <ExternalLink size={11} /></a></>}</span>
        </div>
        <div className="connect-row">
          <span className="connect-wait"><Spinner size={13} />Ждём вход</span>
          <Button variant="quiet" onClick={c.cancelLogin}>Отмена</Button>
        </div>
      </> : <>
        <div className="connect-text">
          <b>Войдите в {c.engine === 'codex' ? 'ChatGPT' : 'свой Claude'}</b>
          <span>Опишите идею или правку словами — {engine.name} расставит блоки на холсте, и вы увидите каждый шаг. Работает по вашей {account}.</span>
        </div>
        <div className="connect-row">
          <Button variant="primary" onClick={c.signIn} loading={c.login.phase === 'opening'}>{engine.login}</Button>
          {others}
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
      {!c.browserOnly && <div className="connect-row">{others}</div>}
    </form>
  );

  return null;
}

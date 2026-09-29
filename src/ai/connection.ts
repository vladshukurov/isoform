// Who builds the scene: an agent on this computer working by the person's own
// subscription — Claude Code (Claude) or Codex (ChatGPT) — or the Anthropic
// API with their key. Everything the dock and the onboarding need to know
// about it, and the sign-in flows.
import { useEffect, useRef, useState } from 'react';
import { localAgent, sendLoginCode, startCodexLogin, startLogin, type LocalAgent } from './local';

// 'local' is Claude Code (the id predates Codex and lives in saved settings).
export type EngineId = 'local' | 'codex' | 'api';
// Agents on this computer write the file on disk themselves.
export const onDisk = (engine: EngineId) => engine !== 'api';
export const ENGINES: Record<EngineId, { name: string; account: string; install?: string; login?: string }> = {
  local: { name: 'Claude Code', account: 'подписка Claude', install: 'npm install -g @anthropic-ai/claude-code', login: 'Войти через Claude' },
  codex: { name: 'Codex', account: 'подписка ChatGPT', install: 'npm install -g @openai/codex', login: 'Войти через ChatGPT' },
  api: { name: 'Ключ Anthropic API', account: 'оплата по использованию' },
};
// What's missing before the agent can work; null — ready (or still checking).
export type Need = 'install' | 'login' | 'key' | null;
// Claude Code shows a code to paste back; Codex finishes in the browser by itself.
export type Login = { phase: 'idle' | 'opening' | 'code' | 'checking' | 'waiting'; url?: string; error?: string };

const KEY = 'isoform:anthropic-key', ENGINE = 'isoform:engine', MODEL = 'isoform:model';
// Claude Code's model: Opus builds better, Sonnet answers sooner.
export type ClaudeModel = 'opus' | 'sonnet';
const read = (key: string) => { try { return localStorage.getItem(key) ?? ''; } catch { return ''; } };
const write = (key: string, value: string) => { try { value ? localStorage.setItem(key, value) : localStorage.removeItem(key); } catch { /* private mode */ } };

// `browserOnly`: the static build, no server — only the API key works there.
export function useConnection(browserOnly: boolean) {
  const [local, setLocal] = useState<LocalAgent | null>(null);
  const [picked, setPicked] = useState<EngineId>(() => (['local', 'codex', 'api'].includes(read(ENGINE)) ? read(ENGINE) : 'local') as EngineId);
  const [key, setKey] = useState(() => read(KEY));
  const [login, setLogin] = useState<Login>({ phase: 'idle' });
  const [model, setModelState] = useState<ClaudeModel>(() => read(MODEL) === 'sonnet' ? 'sonnet' : 'opus');
  const setModel = (m: ClaudeModel) => { setModelState(m); write(MODEL, m); };
  const poll = useRef(0);

  const refresh = () => browserOnly ? Promise.resolve(setLocal({ available: false })) : localAgent().then(l => { setLocal(l); return l; });
  useEffect(() => { refresh(); return () => clearInterval(poll.current); }, [browserOnly]);

  const engine: EngineId = browserOnly ? 'api' : picked;
  const agent = engine === 'codex' ? local?.codex : local ?? undefined;
  const need: Need = engine === 'api'
    ? (key ? null : 'key')
    : !local ? null : !agent?.available ? 'install' : !agent.loggedIn ? 'login' : null;
  const ready = engine === 'api' ? !!key : !!agent?.loggedIn;

  const choose = (id: EngineId) => { setPicked(id); write(ENGINE, id); setLogin({ phase: 'idle' }); };
  const saveKey = (value: string) => { const k = value.trim(); if (!k) return; write(KEY, k); setKey(k); };
  const forgetKey = () => { write(KEY, ''); setKey(''); };

  const signIn = async () => {
    setLogin({ phase: 'opening' });
    if (engine === 'codex') {
      // ChatGPT hands the sign-in back to Codex on its own; wait for it.
      try {
        const { url } = await startCodexLogin();
        setLogin({ phase: 'waiting', url });
        clearInterval(poll.current);
        const until = Date.now() + 5 * 60_000;
        poll.current = window.setInterval(async () => {
          const l = await refresh();
          if (l?.codex?.loggedIn || Date.now() > until) { clearInterval(poll.current); setLogin(l?.codex?.loggedIn ? { phase: 'idle' } : { phase: 'idle', error: 'Вход не завершился — попробуйте ещё раз' }); }
        }, 2000);
      } catch (error) { setLogin({ phase: 'idle', error: (error as Error).message }); }
      return;
    }
    // Claude Code opens the browser and the page there shows a code to paste back.
    try { const { url } = await startLogin(); setLogin({ phase: 'code', url }); }
    catch (error) { setLogin({ phase: 'idle', error: (error as Error).message }); }
  };
  const submitCode = async (code: string) => {
    setLogin(l => ({ ...l, phase: 'checking', error: undefined }));
    try { await sendLoginCode(code); setLogin({ phase: 'idle' }); await refresh(); return true; }
    catch (error) { setLogin(l => ({ ...l, phase: 'code', error: (error as Error).message })); return false; }
  };
  const cancelLogin = () => { clearInterval(poll.current); setLogin({ phase: 'idle' }); };
  // Another account: sign in again over the current one.
  const switchAccount = () => {
    setLocal(l => l && (engine === 'codex' ? { ...l, codex: l.codex && { ...l.codex, loggedIn: false } } : { ...l, loggedIn: false }));
    signIn();
  };

  return {
    engine, local, agent, key, need, ready, browserOnly, login, signingIn: login.phase !== 'idle', model, setModel,
    choose, saveKey, forgetKey, refresh, signIn, submitCode, cancelLogin, switchAccount,
  };
}
export type Connection = ReturnType<typeof useConnection>;

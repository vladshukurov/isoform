// Who builds the scene: Claude Code on this computer, by the person's own
// Claude subscription, or the Anthropic API with their key. Everything the
// dock and the onboarding need to know about it, and the sign-in flow.
import { useEffect, useState } from 'react';
import { localAgent, sendLoginCode, startLogin, type LocalAgent } from './local';

// 'local' is Claude Code.
export type EngineId = 'local' | 'api';
// Claude Code writes the file on disk itself.
export const onDisk = (engine: EngineId) => engine === 'local';
export const ENGINES: Record<EngineId, { name: string; account: string; install?: string }> = {
  local: { name: 'Claude Code', account: 'подписка Claude', install: 'npm install -g @anthropic-ai/claude-code' },
  api: { name: 'Ключ Anthropic API', account: 'оплата по использованию' },
};
// What's missing before Claude can work; null — ready (or still checking).
export type Need = 'install' | 'login' | 'key' | null;
export type Login = { phase: 'idle' | 'opening' | 'code' | 'checking'; url?: string; error?: string };

const KEY = 'isoform:anthropic-key', ENGINE = 'isoform:engine';
const read = (key: string) => { try { return localStorage.getItem(key) ?? ''; } catch { return ''; } };
const write = (key: string, value: string) => { try { value ? localStorage.setItem(key, value) : localStorage.removeItem(key); } catch { /* private mode */ } };

// `browserOnly`: the static build, no server — only the API key works there.
export function useConnection(browserOnly: boolean) {
  const [local, setLocal] = useState<LocalAgent | null>(null);
  const [picked, setPicked] = useState<EngineId>(() => read(ENGINE) === 'api' ? 'api' : 'local');
  const [key, setKey] = useState(() => read(KEY));
  const [login, setLogin] = useState<Login>({ phase: 'idle' });

  const refresh = () => browserOnly ? Promise.resolve(setLocal({ available: false })) : localAgent().then(setLocal);
  useEffect(() => { refresh(); }, [browserOnly]);

  const engine: EngineId = browserOnly ? 'api' : picked;
  const need: Need = engine === 'api'
    ? (key ? null : 'key')
    : !local ? null : !local.available ? 'install' : !local.loggedIn ? 'login' : null;
  const ready = engine === 'api' ? !!key : !!local?.loggedIn;

  const choose = (id: EngineId) => { setPicked(id); write(ENGINE, id); setLogin({ phase: 'idle' }); };
  const saveKey = (value: string) => { const k = value.trim(); if (!k) return; write(KEY, k); setKey(k); };
  const forgetKey = () => { write(KEY, ''); setKey(''); };

  // Claude Code opens the browser and the page there shows a code to paste back.
  const signIn = async () => {
    setLogin({ phase: 'opening' });
    try { const { url } = await startLogin(); setLogin({ phase: 'code', url }); }
    catch (error) { setLogin({ phase: 'idle', error: (error as Error).message }); }
  };
  const submitCode = async (code: string) => {
    setLogin(l => ({ ...l, phase: 'checking', error: undefined }));
    try { await sendLoginCode(code); setLogin({ phase: 'idle' }); await refresh(); return true; }
    catch (error) { setLogin(l => ({ ...l, phase: 'code', error: (error as Error).message })); return false; }
  };
  const cancelLogin = () => setLogin({ phase: 'idle' });
  // Another account: sign in again over the current one.
  const switchAccount = () => { setLocal(l => l && { ...l, loggedIn: false }); choose('local'); signIn(); };

  return {
    engine, local, key, need, ready, browserOnly, login, signingIn: login.phase !== 'idle',
    choose, saveKey, forgetKey, refresh, signIn, submitCode, cancelLogin, switchAccount,
  };
}
export type Connection = ReturnType<typeof useConnection>;

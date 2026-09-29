// Stand-ins for the editor and the Claude connection, so /design.html can
// render real components in any state without a server or Claude.
import type { Connection } from '../ai/connection';
import type { Editor } from '../editor';

const noop = () => undefined;

export function connection(state: Partial<Connection> = {}): Connection {
  return {
    engine: 'local', local: { available: true, loggedIn: true, version: '2.1.197 (Claude Code)' }, key: '', need: null, ready: true,
    browserOnly: false, login: { phase: 'idle' }, signingIn: false,
    choose: noop, saveKey: noop, forgetKey: noop, refresh: async () => undefined, signIn: async () => undefined,
    submitCode: async () => false, cancelLogin: noop, switchAccount: noop,
    ...state,
  };
}

// Any field not given reads as a no-op function: enough for components that
// only call the editor from event handlers.
export function editor(state: Record<string, unknown>): Editor {
  return new Proxy(state, { get: (target, key: string) => key in target ? target[key] : noop }) as unknown as Editor;
}

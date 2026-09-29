import { useEffect, useState } from 'react';
import { AppWindow, Boxes, MousePointerClick, SquareTerminal, Terminal, X } from 'lucide-react';
import type { Editor } from '../editor';
import { CopyBlock, Dialog } from './Dialogs';

type Client = 'claude' | 'codex' | 'cursor' | 'desktop';
const CLIENTS: { id: Client; label: string; Icon: typeof Terminal }[] = [
  { id: 'claude', label: 'Claude Code', Icon: Terminal },
  { id: 'codex', label: 'Codex', Icon: SquareTerminal },
  { id: 'cursor', label: 'Cursor', Icon: MousePointerClick },
  { id: 'desktop', label: 'Claude Desktop', Icon: AppWindow },
];
const SEEN = 'isoform:agents-card';
const read = () => { try { return localStorage.getItem(SEEN) === 'done'; } catch { return true; } };
const done = () => { try { localStorage.setItem(SEEN, 'done'); } catch { /* private mode */ } };

// How each client starts the server: this node, tsx and mcp/server.ts by
// absolute path, so it works from GUI apps without the shell's PATH.
function setup(client: Client, node: string, root: string) {
  const tsx = `${root}/node_modules/tsx/dist/cli.mjs`, server = `${root}/mcp/server.ts`;
  const json = JSON.stringify({ mcpServers: { isoform: { command: node, args: [tsx, server] } } }, null, 2);
  switch (client) {
    case 'claude': return { where: 'В терминале:', code: `claude mcp add --scope user isoform -- "${node}" "${tsx}" "${server}"` };
    case 'codex': return { where: 'Добавьте в ~/.codex/config.toml:', code: `[mcp_servers.isoform]\ncommand = "${node}"\nargs = ["${tsx}", "${server}"]` };
    case 'cursor': return { where: 'Добавьте в ~/.cursor/mcp.json:', code: json };
    case 'desktop': return { where: 'Добавьте в ~/Library/Application Support/Claude/claude_desktop_config.json и перезапустите приложение:', code: json };
  }
}

const ago = (at: number) => {
  const s = Math.round((Date.now() - at) / 1000);
  return s < 60 ? 'только что' : s < 3600 ? `${Math.round(s / 60)} мин назад` : `${Math.round(s / 3600)} ч назад`;
};

// The glyph row on the card and the dialog: Isoform in the middle, clients around.
function Constellation() {
  return (
    <div className="agents-art" aria-hidden>
      <span><Terminal size={18} /></span>
      <span><SquareTerminal size={18} /></span>
      <span className="is-main"><Boxes size={24} /></span>
      <span><MousePointerClick size={18} /></span>
      <span><AppWindow size={18} /></span>
    </div>
  );
}

// First-run card at the foot of the layers panel.
export function AgentsCard({ editor, onSetup }: { editor: Editor; onSetup: () => void }) {
  const [hidden, setHidden] = useState(read);
  if (hidden || editor.local || editor.agent) return null;
  const close = () => { done(); setHidden(true); };
  return (
    <div className="agents-card">
      <Constellation />
      <div className="agents-card-body">
        <h3>Подключите агентов</h3>
        <p>Claude, Codex и Cursor собирают и правят сцены прямо здесь: видят выделенное, проверяют и смотрят превью.</p>
        <div className="row">
          <button className="button" onClick={() => { close(); onSetup(); }}>Настроить</button>
          <button className="button is-quiet" onClick={close}>Позже</button>
        </div>
      </div>
      <button className="icon agents-card-close" aria-label="Закрыть" onClick={close}><X size={12} /></button>
    </div>
  );
}

export function AgentsDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [client, setClient] = useState<Client>('claude');
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 15000); return () => clearInterval(t); }, []);
  const { where, code } = setup(client, editor.nodePath || 'node', editor.root);

  if (editor.local) return (
    <Dialog title="Подключить агентов" onClose={onClose}>
      <div className="steps-plain">
        <p>Агенты подключаются к редактору, запущенному на этом компьютере. Здесь сцены хранятся в браузере — запустите локальную версию:</p>
        <CopyBlock text={'cd isoform\nnpm install\nnpm run dev'} mono />
      </div>
    </Dialog>
  );

  return (
    <Dialog title="Подключить агентов" onClose={onClose}>
      <Constellation />
      <div className="agents-dialog">
        <div className="segmented wide" role="tablist">
          {CLIENTS.map(({ id, label }) => (
            <button key={id} role="tab" aria-pressed={client === id} onClick={() => setClient(id)}>{label}</button>
          ))}
        </div>
        <div className="agents-step">
          <p>{where}</p>
          <CopyBlock text={code} mono />
        </div>
        <div className="agents-step">
          <p>Попросите агента — он сам прочитает правила серии и посмотрит превью:</p>
          <CopyBlock text="Собери в Isoform иллюстрацию «Хранилище паролей»: сейф, дверца открывается при наведении" />
          <CopyBlock text="Сделай выделенные блоки в Isoform на 10 выше и добавь им волну задержек" />
        </div>
        <div className={`agents-status${editor.agent ? ' is-on' : ''}`}>
          <i />
          {editor.agent
            ? <span>Агент на связи · {ago(editor.agent.at)} · {editor.agent.tool}{editor.agent.file ? ` ${editor.agent.file}` : ''}</span>
            : <span>Ждём первого вызова — редактор должен быть открыт</span>}
        </div>
      </div>
    </Dialog>
  );
}

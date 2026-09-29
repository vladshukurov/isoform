import { Check, Plus } from 'lucide-react';
import { CardPreview } from '../CardPreview';
import type { Editor } from '../editor';
import { ClaudeMark } from './ClaudeMark';
import { Connect } from './Connect';
import { Dialog } from './Dialogs';
import { Mark } from './Glyph';
import { Button, Code, Kbd, Spinner } from './kit';

// The first screen for someone who has just cloned the project: connect
// Claude, then start a scene — with Claude, from the series, or empty.
// Also in the main menu as «Начало работы».
export function Welcome({ editor, onClose }: { editor: Editor; onClose?: () => void }) {
  const { claude } = editor, c = claude.connection;
  const start = (template?: string) => { editor.createFile(template); onClose?.(); };
  const withClaude = () => { editor.createFile(); claude.setOpen(true); onClose?.(); };
  const status = !c.local && !c.browserOnly
    ? <span className="welcome-status"><Spinner size={12} />Ищем Claude Code на этом компьютере</span>
    : c.ready
      ? <span className="welcome-status">
          {c.engine === 'local' ? `Claude Code${c.local?.version ? ` ${c.local.version.split(' ')[0]}` : ''} — ваша подписка` : 'Ключ API сохранён'}
          {!c.browserOnly && <Button variant="link" onClick={() => c.choose(c.engine === 'local' ? 'api' : 'local')}>
            {c.engine === 'local' ? 'Ключ API вместо подписки' : 'Подписка вместо ключа'}
          </Button>}
        </span>
      : null;

  return (
    <Dialog title="Начало работы" onClose={onClose} wide>
      <div className="welcome">
        <div className="welcome-hero">
          <span className="logo"><Mark size={22} /></span>
          <div>
            <h1>Isoform</h1>
            <p>Изометрические иллюстрации для сайта Passwork. Опишите идею словами — Claude соберёт сцену на холсте, а вы доведёте её руками.</p>
          </div>
        </div>
        <ol className="welcome-steps">
          <li className={c.ready ? 'is-done' : ''}>
            <i className="welcome-num">{c.ready ? <Check size={13} /> : 1}</i>
            <div className="welcome-step">
              <b>Подключите Claude</b>
              {status ?? <Connect connection={c} />}
            </div>
          </li>
          <li>
            <i className="welcome-num">2</i>
            <div className="welcome-step">
              <b>Начните сцену</b>
              <span className="welcome-status">Опишите идею Claude или возьмите сцену серии за основу — шаблон открывается копией.</span>
              <div className="tiles is-compact">
                <button className={`tile${c.ready ? '' : ' is-off'}`} onClick={withClaude} disabled={!c.ready}>
                  <div className="tile-art tile-blank tile-agent"><ClaudeMark size={22} /></div>
                  <span>Собрать с Claude</span>
                </button>
                <button className="tile" onClick={() => start()}>
                  <div className="tile-art tile-blank"><Plus size={20} /></div>
                  <span>Пустой</span>
                </button>
                {Object.entries(editor.templates).map(([name, scene]) => (
                  <button key={name} className="tile" onClick={() => start(name)}>
                    <div className="tile-art"><CardPreview scene={scene} /></div>
                    <span>{scene.title}</span>
                  </button>
                ))}
              </div>
            </div>
          </li>
        </ol>
        <p className="welcome-foot">Все клавиши — <Kbd>?</Kbd> · Новая версия редактора — <Code>git pull</Code>, <Code>npm install</Code> и снова <Code>npm run dev</Code></p>
      </div>
    </Dialog>
  );
}

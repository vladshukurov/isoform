import { useState } from 'react';
import { CardPreview } from './CardPreview';
import type { Editor } from './editor';

// The whole series side by side, as the cards sit on the site: the place to
// check that scenes have equal weight and don't look alike.
export function Series({ editor, onOpen }: { editor: Editor; onOpen: (name: string) => void }) {
  const [hold, setHold] = useState(false);
  return (
    <div className="series">
      <div className="series-bar">
        <label><input type="checkbox" checked={hold} onChange={e => setHold(e.target.checked)} /> Показать всё в наведении</label>
        <span>Наведите на карточку, чтобы проиграть движение; клик открывает сцену</span>
      </div>
      <div className="series-grid">
        {Object.entries(editor.scenes).map(([name, scene]) => (
          <button key={name} className="series-item" onClick={() => onOpen(name)}>
            <CardPreview scene={scene} label={`${scene.title} · ${name}`} hold={hold} />
          </button>
        ))}
      </div>
    </div>
  );
}

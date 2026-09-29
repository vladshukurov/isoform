import { Component, type ReactNode } from 'react';
import { Button } from './kit';

// A render error shows what happened and a way back instead of a blank
// page. Files are saved on every edit, so reloading loses nothing saved.
export class Crash extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash" role="alert">
        <h2>Что-то сломалось</h2>
        <p>Файлы сохраняются при каждой правке — после перезагрузки всё будет на месте. Если повторяется, пришлите текст ниже.</p>
        <pre>{this.state.error.message}</pre>
        <div className="row">
          <Button variant="primary" onClick={() => location.reload()}>Перезагрузить</Button>
          <Button variant="quiet" onClick={() => navigator.clipboard?.writeText(`${this.state.error!.message}\n${this.state.error!.stack ?? ''}`)}>Скопировать ошибку</Button>
        </div>
      </div>
    );
  }
}

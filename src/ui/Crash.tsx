import { Component, type ReactNode } from 'react';

// A render error shows what happened and a way back instead of a blank
// page. Files are saved on every edit, so reloading loses nothing saved.
export class Crash extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash">
        <h2>Что-то сломалось</h2>
        <pre>{this.state.error.message}</pre>
        <button className="button" onClick={() => location.reload()}>Перезагрузить</button>
      </div>
    );
  }
}

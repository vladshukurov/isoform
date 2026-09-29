import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { scenesApi } from './server/plugin';

export default defineConfig({
  plugins: [react(), scenesApi()],
  // Two pages: the editor, and its design system at /design.html.
  build: { rollupOptions: { input: { main: 'index.html', design: 'design.html' } } },
  // Eval sandboxes link the whole project in; the watcher stays out of them.
  server: { port: 8790, strictPort: true, watch: { ignored: ['**/eval/runs/**'] } },
});

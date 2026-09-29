import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { scenesApi } from './server/plugin';

export default defineConfig({
  plugins: [react(), scenesApi()],
  // Eval sandboxes link the whole project in; the watcher stays out of them.
  server: { port: 8790, strictPort: true, watch: { ignored: ['**/eval/runs/**'] } },
});

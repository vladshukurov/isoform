import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { scenesApi } from './server/plugin';

export default defineConfig({
  plugins: [react(), scenesApi()],
  server: { port: 8790, strictPort: true },
});

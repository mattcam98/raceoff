import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development the server runs separately; proxy to it so the app is same-origin, as in production.
const server = process.env.RACEOFF_SERVER ?? 'http://localhost:3300';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5174,
    proxy: {
      '/api': server,
      '/socket.io': { target: server, ws: true },
    },
  },
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 900 },
});

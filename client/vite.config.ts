import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// Support deployment at subpath (e.g. Coolify at /metrics-lab-speed-server)
// Set VITE_BASE_PATH=/your-subpath/ in build env if needed
const base = (process.env.VITE_BASE_PATH || '/').replace(/\/*$/, '/');

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../src/shared'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3002', changeOrigin: true },
      '/ws': { target: 'ws://localhost:3002', ws: true },
    },
  },
});

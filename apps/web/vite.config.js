import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const api = `http://127.0.0.1:${process.env.COOKHOARD_PORT || process.env.PORT || 5201}`;

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: { host: '127.0.0.1', port: Number(process.env.VITE_PORT || 5173), proxy: { '/api': api, '/media': api } },
});

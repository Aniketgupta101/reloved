import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@shared': path.resolve(__dirname, '../shared'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify: file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // Local backend (see ../backend) — lets the frontend call fetch('/api/...')
      // without CORS setup in dev. Production builds should set VITE_API_URL instead.
      proxy: {
        '/api': { target: 'http://localhost:8787', changeOrigin: true },
        '/uploads': { target: 'http://localhost:8787', changeOrigin: true },
      },
    },
  };
});

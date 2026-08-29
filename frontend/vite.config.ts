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
      // Dev proxy: leave VITE_API_URL empty so the app calls `/api/...` same-origin.
      // Default = local Express (:8787). Override with VITE_DEV_API_PROXY for Firebase live.
      proxy: {
        '/api': {
          target: process.env.VITE_DEV_API_PROXY || 'http://localhost:8787',
          changeOrigin: true,
          secure: false,
          timeout: 180_000,
          proxyTimeout: 180_000,
        },
        '/uploads': {
          target: process.env.VITE_DEV_UPLOADS_PROXY || 'http://localhost:8787',
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});

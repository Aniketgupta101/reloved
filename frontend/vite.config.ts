import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

/**
 * Local courier A/B (optional):
 *   VITE_API_URL=  (empty) + VITE_LOCAL_COURIER=1
 *   → auth/OTP go to production; Shiprocket/Shadowfax book routes hit localhost:8787
 *
 * Default (safe login): set VITE_API_URL=https://reloved-digital.web.app in .env.local
 */
export default defineConfig(() => {
  const productionApi = process.env.VITE_DEV_API_PROXY || 'https://reloved-digital.web.app'
  const localApi = 'http://localhost:8787'
  const localCourier = process.env.VITE_LOCAL_COURIER === '1'

  const proxy: Record<string, object> = {}

  if (localCourier) {
    // More specific paths first — courier book/cancel/estimate/status → local Express
    const courierTarget = {
      target: localApi,
      changeOrigin: true,
      secure: false,
      timeout: 180_000,
      proxyTimeout: 180_000,
    }
    proxy['^/api/donor/item-requests/[^/]+/(shiprocket|shadowfax)/'] = courierTarget
    proxy['^/api/admin/item-requests/[^/]+/(shiprocket|shadowfax)/'] = courierTarget
    proxy['^/api/admin/(shiprocket|shadowfax)(/|$)'] = courierTarget
  }

  proxy['/api'] = {
    target: localCourier ? productionApi : (process.env.VITE_DEV_API_PROXY || localApi),
    changeOrigin: true,
    secure: false,
    timeout: 180_000,
    proxyTimeout: 180_000,
  }
  proxy['/uploads'] = {
    target: process.env.VITE_DEV_UPLOADS_PROXY || (localCourier ? productionApi : localApi),
    changeOrigin: true,
    secure: false,
  }

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@shared': path.resolve(__dirname, '../shared'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy,
    },
  };
});

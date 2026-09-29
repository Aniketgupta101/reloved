import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'node:fs';
import {defineConfig} from 'vite';

/**
 * Local courier A/B (optional):
 *   VITE_API_URL=  (empty) + VITE_LOCAL_COURIER=1
 *   → auth/OTP go to production; Shiprocket/Shadowfax book routes hit localhost:8787
 *
 * Default (safe login): set VITE_API_URL=https://reloved-digital.web.app in .env.local
 */
export default defineConfig(() => {
  const localQa = process.env.ADMIN_LOCAL_QA === '1'
  if (localQa) {
    const required = ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT', 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']
    if (required.some(key => !/^127\.0\.0\.1:\d+$/.test(process.env[key] || '') && key.endsWith('_HOST')) || process.env.GCLOUD_PROJECT !== 'demo-reloved-admin' || process.env.GOOGLE_CLOUD_PROJECT !== 'demo-reloved-admin') throw new Error('Local QA requires the demo project and loopback emulator hosts')
    if (process.env.VITE_API_URL !== '' || process.env.VITE_DEV_API_PROXY !== 'http://127.0.0.1:8787' || process.env.VITE_DEV_UPLOADS_PROXY !== 'http://127.0.0.1:8787' || process.env.VITE_FIREBASE_PROJECT_ID !== 'demo-reloved-admin' || process.env.VITE_POSTHOG_PROJECT_TOKEN || process.env.VITE_LOCAL_COURIER === '1' || process.env.VITE_ADMIN_LOCAL_QA !== '1') throw new Error('Local QA requires synthetic-only frontend configuration')
    if (fs.readdirSync(path.resolve(__dirname, 'scripts')).some(name => /^\.env(?:\.|$)/.test(name))) throw new Error('Remove env files from local QA script directory')
  }
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
    envDir: localQa ? path.resolve(__dirname, 'scripts') : undefined,
    plugins: [react(), tailwindcss(), ...(localQa ? [{
      name: 'admin-local-strip-remote-html',
      transformIndexHtml(html: string) {
        return html
          .replace(/<!-- Google Tag Manager -->[\s\S]*?<!-- End Google Tag Manager -->/g, '')
          .replace(/<!-- Google tag \(gtag\.js\) -->[\s\S]*?<!-- End Google tag \(gtag\.js\) -->/g, '')
          .replace(/<!-- Google Tag Manager \(noscript\) -->[\s\S]*?<!-- End Google Tag Manager \(noscript\) -->/g, '')
          .replace(/^.*<link[^>]+(?:preconnect|dns-prefetch|preload)[^>]*https?:\/\/[^>]+>.*$/gm, '')
          .replace(/^.*<link[^>]+href="https?:\/\/[^>]+>.*$/gm, '')
      },
    }] : [])],
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

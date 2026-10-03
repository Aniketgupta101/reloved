import { randomBytes } from 'node:crypto'

export function assertLocalEnvironment(env) {
  if (env.ADMIN_LOCAL_QA !== '1' || env.GCLOUD_PROJECT !== 'demo-reloved-admin' || env.GOOGLE_CLOUD_PROJECT !== 'demo-reloved-admin') {
    throw new Error('Local QA requires the demo-reloved-admin project')
  }
  for (const key of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']) {
    if (!/^127\.0\.0\.1:\d+$/.test(env[key] || '')) throw new Error(`${key} must point to loopback emulator`)
  }
  if (env.VITE_API_URL !== '' || env.VITE_DEV_API_PROXY !== 'http://127.0.0.1:8787') throw new Error('Local API origin is required')
}

export function makeLocalEnvironment(parent = process.env) {
  const env = {
    PATH: parent.PATH, HOME: parent.HOME, TMPDIR: parent.TMPDIR, JAVA_HOME: parent.JAVA_HOME,
    ADMIN_LOCAL_QA: '1', GCLOUD_PROJECT: 'demo-reloved-admin', GOOGLE_CLOUD_PROJECT: 'demo-reloved-admin',
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199', STORAGE_BUCKET: 'demo-reloved-admin.appspot.com',
    VITE_API_URL: '', VITE_DEV_API_PROXY: 'http://127.0.0.1:8787',
    VITE_DEV_UPLOADS_PROXY: 'http://127.0.0.1:8787', VITE_FIREBASE_PROJECT_ID: 'demo-reloved-admin',
    VITE_FIREBASE_API_KEY: 'synthetic-local-key', VITE_FIREBASE_AUTH_DOMAIN: 'demo-reloved-admin.firebaseapp.com',
    VITE_FIREBASE_APP_ID: 'synthetic-local-app', VITE_POSTHOG_PROJECT_TOKEN: '',
    VITE_ADMIN_LOCAL_QA: '1',
    JWT_SECRET: randomBytes(48).toString('hex'), ADMIN_EMAIL: 'admin@synthetic.invalid',
    ADMIN_PASSWORD: 'synthetic-local-admin', PUBLIC_APP_URL: 'http://127.0.0.1:3100',
  }
  assertLocalEnvironment(env)
  return env
}

export const localFrontendCommands = [
  ['npm', 'run', 'build'],
  ['npm', 'run', 'preview', '--', '--host', '127.0.0.1', '--port', '3100', '--strictPort'],
]

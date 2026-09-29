import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeLocalEnvironment } from './admin-local-harness.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const result = spawnSync(process.execPath, ['lib/scripts/seedAdminControlCenter.js'], {
  cwd: resolve(root, 'firebase-backend/functions'), env: makeLocalEnvironment(), stdio: 'inherit',
})
process.exitCode = result.status ?? 1

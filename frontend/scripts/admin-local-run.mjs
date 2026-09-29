import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeLocalEnvironment } from './admin-local-harness.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const env = makeLocalEnvironment()
const children = []
function start(command, args, cwd) {
  const child = spawn(command, args, { cwd, env, stdio: 'inherit' })
  children.push(child)
  child.on('exit', (code) => { if (code && !stopping) shutdown(code) })
}
let stopping = false
function shutdown(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill('SIGTERM')
  process.exitCode = code
}
process.on('SIGINT', () => shutdown())
process.on('SIGTERM', () => shutdown())
start('firebase', ['emulators:start', '--only', 'firestore,auth,storage', '--project', 'demo-reloved-admin'], resolve(root, 'firebase-backend'))
start(process.execPath, ['scripts/admin-local-api.mjs'], resolve(root, 'frontend'))
start('npm', ['run', 'dev', '--', '--host', '127.0.0.1'], resolve(root, 'frontend'))

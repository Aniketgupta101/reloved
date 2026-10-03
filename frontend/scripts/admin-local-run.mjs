import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeLocalEnvironment, localFrontendCommands } from './admin-local-harness.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const env = makeLocalEnvironment()
const children = new Set()
let stopping = false
function start(command, args, cwd) {
  const child = spawn(command, args, { cwd, env, stdio: 'inherit' })
  children.add(child)
  child.on('error', error => { console.error(error.message); shutdown(1) })
  child.on('exit', code => { children.delete(child); if (code && !stopping) shutdown(code) })
  return child
}
function shutdown(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill('SIGTERM')
  process.exitCode = code
}
process.on('SIGINT', () => shutdown())
process.on('SIGTERM', () => shutdown())
const [build, preview] = localFrontendCommands
const builder = start(build[0], build.slice(1), resolve(root, 'frontend'))
builder.on('exit', code => {
  if (code !== 0 || stopping) return
  start('firebase', ['emulators:start', '--only', 'firestore,auth,storage', '--project', 'demo-reloved-admin'], resolve(root, 'firebase-backend'))
  start(process.execPath, ['scripts/admin-local-api.mjs'], resolve(root, 'frontend'))
  start(preview[0], preview.slice(1), resolve(root, 'frontend'))
})

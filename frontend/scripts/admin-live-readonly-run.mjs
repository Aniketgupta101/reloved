import { execFileSync, spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { readFile } from 'node:fs/promises'

import {
  createAdminReadToken,
  createLiveReadOnlyEnvironment,
  createProductionReadClient,
  liveReadOnlyFrontendCommands,
  selectLiveReviewConfig,
} from './admin-live-readonly-harness.mjs'
import {
  createBundleStatsLoader,
  createLiveBundleLoader,
  createLiveIntegrationStatusLoader,
  createLiveOverviewBundleLoader,
  createLiveReadDispatcher,
  createLiveReadOnlyServer,
  createPageSpeedLoader,
} from './admin-live-readonly-api.mjs'

function parseEnv(text) {
  const values = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const separator = line.indexOf('=')
    const key = line.slice(0, separator).trim().replace(/^export\s+/, '')
    let value = line.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    values[key] = value
  }
  return values
}

function run(command, args, env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), env, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => code === 0 ? resolvePromise(child) : reject(new Error(`${command} exited ${code ?? signal}`)))
  })
}

const commonGitDir = execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim()
const primaryRoot = dirname(resolve(process.cwd(), commonGitDir))
const frontendEnvPath = process.env.ADMIN_LIVE_FRONTEND_ENV_FILE || resolve(primaryRoot, 'env')
const backendEnvPath = process.env.ADMIN_LIVE_BACKEND_ENV_FILE || resolve(primaryRoot, 'env.reloved-digital')
const [frontendEnv, backendEnv] = await Promise.all([
  readFile(frontendEnvPath, 'utf8').then(parseEnv),
  readFile(backendEnvPath, 'utf8').then(parseEnv),
])
const config = selectLiveReviewConfig(frontendEnv, backendEnv)
const client = createProductionReadClient({
  apiBase: config.apiBase,
  token: () => createAdminReadToken(config),
})
const loadBundle = createLiveBundleLoader({ client })
const loadOverviewBundle = createLiveOverviewBundleLoader({ client })
const getIntegrationStatuses = createLiveIntegrationStatusLoader({ client })
const getPageSpeed = createPageSpeedLoader({ publicSiteUrl: config.publicSiteUrl, apiKey: config.pageSpeedApiKey })
const getBundleStats = createBundleStatsLoader(resolve(process.cwd(), 'build/admin-live-readonly/assets'))
const privacyMode = process.env.ADMIN_LIVE_PRIVACY_MODE === '1'
const dispatch = createLiveReadDispatcher({ loadBundle, loadOverviewBundle, privacyMode, capabilities: config.capabilities, getIntegrationStatuses, getPageSpeed, getBundleStats })
const apiServer = createLiveReadOnlyServer({ apiBase: config.apiBase, dispatch })

await new Promise((resolvePromise, reject) => {
  apiServer.once('error', reject)
  apiServer.listen(8788, '127.0.0.1', resolvePromise)
})
console.log('Live read-only adapter: http://127.0.0.1:8788')

const childEnv = createLiveReadOnlyEnvironment(process.env)
let preview
try {
  const [buildCommand, ...buildArgs] = liveReadOnlyFrontendCommands[0]
  await run(buildCommand, buildArgs, childEnv)
  const [previewCommand, ...previewArgs] = liveReadOnlyFrontendCommands[1]
  preview = spawn(previewCommand, previewArgs, { cwd: process.cwd(), env: childEnv, stdio: 'inherit' })
  const shutdown = () => {
    preview?.kill('SIGTERM')
    apiServer.close()
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
  await new Promise((resolvePromise, reject) => {
    preview.once('error', reject)
    preview.once('exit', (code, signal) => code === 0 || signal === 'SIGTERM' ? resolvePromise() : reject(new Error(`preview exited ${code ?? signal}`)))
  })
} finally {
  apiServer.close()
}

import { createRequire } from 'node:module'
import net from 'node:net'
import { assertLocalEnvironment } from './admin-local-harness.mjs'

assertLocalEnvironment(process.env)
const originalConnect = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...args) {
  const first = args[0]
  const host = typeof first === 'object' && first !== null
    ? first.host || first.hostname || '127.0.0.1'
    : typeof args[1] === 'string' ? args[1] : '127.0.0.1'
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error(`Local QA blocked outbound socket to ${host}`)
  return originalConnect.apply(this, args)
}
// All provider traffic is refused at the process boundary, including hard-coded URLs.
const nativeFetch = globalThis.fetch
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === 'string' ? input : input.url)
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error(`Local QA blocked outbound request to ${url.hostname}`)
  }
  return nativeFetch(input, options)
}
const require = createRequire(import.meta.url)
const { createApp } = require('../../firebase-backend/functions/lib/app.js')
createApp().listen(8787, '127.0.0.1', () => console.log('Synthetic API: http://127.0.0.1:8787'))

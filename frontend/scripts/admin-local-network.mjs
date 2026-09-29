import net from 'node:net'

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost'])
const REDIRECTS = new Set([301, 302, 303, 307, 308])

function socketHost(args) {
  const first = args[0]
  // Node's net.createConnection passes an array of normalized arguments
  // through Socket.connect. Inspect the nested options, not the array.
  if (Array.isArray(first)) return socketHost(first)
  if (first && typeof first === 'object') return first.host || first.hostname || null
  if (typeof first === 'number') return typeof args[1] === 'string' ? args[1] : null
  return null
}

export function installLocalNetworkGuard({ fetch: nativeFetch = globalThis.fetch } = {}) {
  const originalConnect = net.Socket.prototype.connect
  const originalFetch = globalThis.fetch
  net.Socket.prototype.connect = function (...args) {
    const host = socketHost(args)
    if (!LOOPBACK.has(host)) throw new Error('Local QA blocked outbound socket to ' + (host || 'unknown host'))
    return originalConnect.apply(this, args)
  }

  globalThis.fetch = async (input, init) => {
    let request = new Request(input, init)
    for (let redirects = 0; redirects <= 10; redirects++) {
      const url = new URL(request.url)
      if (!LOOPBACK.has(url.hostname)) throw new Error('Local QA blocked outbound request to ' + url.hostname)
      const response = await nativeFetch(request, { redirect: 'manual' })
      const location = response.headers.get('location')
      if (!REDIRECTS.has(response.status) || !location) return response
      if (request.redirect === 'manual') return response
      if (request.redirect === 'error') throw new Error('Local QA blocked redirect')
      const next = new URL(location, url)
      if (!LOOPBACK.has(next.hostname)) throw new Error('Local QA blocked outbound request to ' + next.hostname)
      request = new Request(next, {
        method: response.status === 303 ? 'GET' : request.method,
        headers: request.headers,
        body: response.status === 303 || ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        duplex: request.body ? 'half' : undefined,
      })
    }
    throw new Error('Local QA blocked excessive redirects')
  }

  return () => {
    net.Socket.prototype.connect = originalConnect
    globalThis.fetch = originalFetch
  }
}

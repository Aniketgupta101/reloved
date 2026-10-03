import assert from 'node:assert/strict'
import { test } from 'node:test'
import net from 'node:net'
import http from 'node:http'
import https from 'node:https'
import { installLocalNetworkGuard } from './admin-local-network.mjs'

test('rejects direct and normalized remote sockets before transport', () => {
  const original = net.Socket.prototype.connect
  let calls = 0
  net.Socket.prototype.connect = function () { calls++; return this }
  const restore = installLocalNetworkGuard({ fetch: async () => { throw Error('unexpected fetch') } })
  try {
    assert.throws(() => net.createConnection({ host: 'example.invalid', port: 443 }), /blocked outbound socket/)
    assert.throws(() => new net.Socket().connect([{ host: 'example.invalid', port: 443 }]), /blocked outbound socket/)
    assert.throws(() => net.createConnection({ port: 443 }), /blocked outbound socket/)
    assert.doesNotThrow(() => net.createConnection({ host: '127.0.0.1', port: 8080 }))
    assert.equal(calls, 1)
  } finally { restore(); net.Socket.prototype.connect = original }
})

test('HTTP and HTTPS cannot open remote sockets', async () => {
  const original = net.Socket.prototype.connect
  let calls = 0
  net.Socket.prototype.connect = function () { calls++; return this }
  const restore = installLocalNetworkGuard({ fetch: async () => { throw Error('unexpected fetch') } })
  try {
    for (const module of [http, https]) {
      await assert.rejects(async () => {
        const req = module.get((module === http ? 'http://' : 'https://') + 'example.invalid/test')
        await new Promise((resolve, reject) => req.once('error', reject).once('response', resolve))
      }, /blocked outbound socket/)
    }
    assert.equal(calls, 0)
  } finally { restore(); net.Socket.prototype.connect = original }
})

test('fetch refuses remote origin and local redirect to remote before second request', async () => {
  const original = net.Socket.prototype.connect
  net.Socket.prototype.connect = function () { throw Error('unexpected socket') }
  const seen = []
  const restore = installLocalNetworkGuard({ fetch: async (url) => {
    seen.push(url.url || String(url))
    return new Response(null, { status: 302, headers: { location: 'https://example.invalid/send' } })
  } })
  try {
    await assert.rejects(fetch('https://example.invalid/send'), /blocked outbound request/)
    await assert.rejects(fetch('http://127.0.0.1:8787/redirect'), /blocked outbound request/)
    assert.deepEqual(seen, ['http://127.0.0.1:8787/redirect'])
  } finally { restore(); net.Socket.prototype.connect = original }
})

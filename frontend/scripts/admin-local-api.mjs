import { createRequire } from 'node:module'
import { assertLocalEnvironment } from './admin-local-harness.mjs'
import { installLocalNetworkGuard } from './admin-local-network.mjs'

assertLocalEnvironment(process.env)
installLocalNetworkGuard()
const require = createRequire(import.meta.url)
const { createApp } = require('../../firebase-backend/functions/lib/app.js')
createApp().listen(8787, '127.0.0.1', () => console.log('Synthetic API: http://127.0.0.1:8787'))

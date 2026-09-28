import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'

// Execute the existing fallback controller with local reads only. No React render,
// credentials, service or production data is required for this regression.
const source = await readFile('src/pages/admin/AdminDashboard.tsx', 'utf8')
const stages = ['pending_giver', 'awaiting_delivery_address', 'awaiting_address_confirm', 'awaiting_schedule', 'schedule_proposed', 'schedule_agreed', 'awaiting_handover', 'received', null]
const requests = stages.map((handoverStage, index) => ({ id: String(index), handoverStage, giverName: 'Synthetic giver', giverPhone: '9999999999' }))
const reads = []
const fixtures = {
  '/api/admin/item-requests?status=pending': { requests: [] },
  '/api/admin/item-requests?status=approved': { requests },
  '/api/admin/submissions': { submissions: [] },
  '/api/admin/orders': { orders: [] },
  '/api/admin/items': { items: [] },
}
const sandbox = {
  exports: {},
  require: name => {
    if (name === '@/lib/api') return { api: { admin: { get: async path => {
      assert.ok(Object.hasOwn(fixtures, path), `Unexpected read: ${path}`)
      reads.push(path)
      return fixtures[path]
    } } } }
    // Imported presentation modules are not executed by the fallback.
    return {}
  },
}
const compiled = ts.transpileModule(source + '\nexports.fallbackForTest = loadOverviewFallback;', {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText
vm.runInNewContext(compiled, sandbox, { filename: 'AdminDashboard.fixture.cjs' })
const overview = await sandbox.exports.fallbackForTest()
assert.deepEqual(Array.from(overview.stuckMatched, claim => claim.handoverStage), stages.slice(0, 5))
assert.equal(overview.counts.stuckMatched, 5)
assert.equal(overview.matched.some(claim => claim.handoverStage === 'received'), false)
assert.equal(overview.counts.matched, 8)
assert.deepEqual(reads.sort(), Object.keys(fixtures).sort())
console.log('PASS admin fallback: all five waiting stages included, active/completed/missing stages excluded from attention; local reads only')

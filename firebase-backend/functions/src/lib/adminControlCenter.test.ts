import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adminControlCenterFixtures } from '../scripts/seedAdminControlCenter';
let model: any = {};
try {
    model = require('./adminControlCenter');
}
catch { }
const now = new Date('2026-09-29T18:00:00Z');
test('IST day and rolling next 48 hours use half-open boundaries', () => {
    assert.equal(typeof model.timeWindows, 'function');
    const w = model.timeWindows(now);
    assert.equal(w.todayStart, '2026-09-28T18:30:00.000Z');
    assert.equal(w.todayEnd, '2026-09-29T18:30:00.000Z');
    assert.equal(w.next48End, '2026-10-01T18:00:00.000Z');
    assert.equal(model.inWindow(w.todayEnd, w.todayStart, w.todayEnd), false);
    assert.equal(model.inWindow(w.todayStart, w.todayStart, w.todayEnd), true);
    assert.equal(model.inWindow(w.next48End, now.toISOString(), w.next48End), false);
});
test('notification audit distinguishes attempts, failed and skipped with no inferred delivery', () => {
    assert.equal(typeof model.notificationAudit, 'function');
    const audit = model.notificationAudit(adminControlCenterFixtures().notificationEvents, 'complete');
    assert.deepEqual(audit.sms.counts, {
        sent: 1, failed: 1, skipped: 1
    });
    assert.deepEqual(audit.email.counts, {
        sent: 1, failed: 1, skipped: 0
    });
    assert.equal(audit.sms.latest.status, 'sent');
    assert.equal(model.notificationAudit([], 'unavailable').sms.state, 'unavailable');
});
test('attention derives overdue, due soon, missing schedule/address and undated waiting claims', () => {
    assert.equal(typeof model.attentionFromRecord, 'function');
    const claim = {
        id: 'claim', status: 'approved', deliveryMethod: 'giver_sends', agreedSlotAt: '2026-09-29T17:00:00Z'
    };
    assert.equal(model.attentionFromRecord('itemRequests', claim, now).type, 'overdue_delivery');
    assert.equal(model.attentionFromRecord('itemRequests', { ...claim, agreedSlotAt: '2026-09-29T18:30:00Z' }, now).type, 'delivery_due_soon');
    assert.equal(model.attentionFromRecord('itemRequests', { id: 'undated', status: 'pending' }, now).occurredAt, null);
    assert.equal(model.attentionFromRecord('itemRequests', {
        id: 'address', status: 'approved', handoverStage: 'awaiting_address'
    }, now).type, 'missing_address');
    assert.equal(model.attentionFromRecord('itemRequests', {
        id: 'schedule', status: 'approved', handoverStage: 'awaiting_schedule'
    }, now).type, 'missing_schedule');
    assert.equal(model.attentionFromRecord('itemRequests', { ...claim, deliveryStatus: 'delivered' }, now), null);
});
test('source caps and undated records never become fabricated KPI totals or zero', () => {
    assert.equal(typeof model.buildOverview, 'function');
    const source = (rows: any[], state = 'complete') => ({
        rows, state, reason: state === 'complete' ? null : 'Source limit reached'
    });
    const sources = Object.fromEntries(Object.entries(adminControlCenterFixtures()).map(([key, rows]) => [key, source(rows)]));
    sources.donorProfiles = source([{ id: 'undated' }]);
    sources.itemRequests = source([], 'partial');
    const view = model.buildOverview(sources, now, '7d');
    assert.equal(view.kpis.find((k: any) => k.id === 'newUsers').value, null);
    assert.equal(view.kpis.find((k: any) => k.id === 'claims').value, null);
    assert.equal(view.kpis.find((k: any) => k.id === 'activeUsers').value, null);
    assert.equal(view.kpis.find((k: any) => k.id === 'users').value, 1);
});
test('cursor is validated and bound to category and frozen asOf', () => {
    assert.equal(typeof model.decodeAttentionCursor, 'function');
    const encoded = model.encodeAttentionCursor({
        version: 1, category: 'all', source: 0, after: 'abc', asOf: now.toISOString()
    });
    assert.equal(model.decodeAttentionCursor(encoded, 'all').after, 'abc');
    assert.throws(() => model.decodeAttentionCursor(encoded, 'delivery'));
    assert.throws(() => model.decodeAttentionCursor('garbage', 'all'));
});
test('handover is not receipt, and giverLogistics determines missing address', () => {
    const sources = { itemRequests: {
            rows: [{
                    id: 'handover', status: 'approved', handoverStage: 'handed_over', createdAt: now.toISOString()
                }], state: 'complete', reason: null
        } };
    const view = model.buildOverview(sources, new Date(now.getTime() + 1), '7d');
    assert.equal(view.kpis.find((k: any) => k.id === 'completed').value, 0);
    assert.equal(model.attentionFromRecord('itemRequests', {
        id: 'address', status: 'approved', giverLogistics: 'giver_sends'
    }, now).type, 'missing_address');
});
test('source failure produces unavailable metadata without an inferred count', async () => {
    const db = { collection: () => ({ count: () => ({ get: async () => { throw Object.assign(new Error('Synthetic read failure'), { code: 'unavailable' }); } }) }) };
    const sources = await model.readSources(db, ['donorProfiles']);
    assert.equal(sources.donorProfiles.state, 'unavailable');
    assert.equal(model.buildOverview(sources, now, '24h').kpis.find((k: any) => k.id === 'users').value, null);
});

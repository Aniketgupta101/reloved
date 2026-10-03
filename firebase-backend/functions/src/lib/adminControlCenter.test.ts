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
test('attention preserves recorded notification context and focuses linked claim', () => {
    const event = model.attentionFromRecord('notificationEvents', {
        id: 'event-1', claimId: 'claim-1', channel: 'email', status: 'failed',
        subject: 'Recorded subject', previewBody: 'Recorded summary', error: 'Provider rejected',
        templateKey: 'rider_coming_giver',
    }, now);
    assert.equal(event.entityLabel, 'Claim communication');
    assert.deepEqual(event.recorded, { subject: 'Recorded subject', preview: 'Recorded summary', error: 'Provider rejected' });
    assert.equal(event.nextAction.href, '/admin/orders?claimId=claim-1');
    assert.equal(event.actions[0].primary, true);
    const claim = model.attentionFromRecord('itemRequests', { id: 'claim-2', status: 'pending', itemTitle: 'Blue shirt' }, now);
    assert.equal(claim.entityLabel, 'Blue shirt');
    assert.equal(claim.nextAction.href, '/admin/item-requests?claimId=claim-2');
    const support = model.attentionFromRecord('contactMessages', { id: 'contact-1', status: 'new', subject: 'Help request', message: 'Recorded support message' }, now);
    assert.equal(support.entityLabel, 'Help request');
    assert.equal(support.recorded.preview, 'Recorded support message');
    assert.equal(support.nextAction.href, '/admin/messages?messageId=contact-1');
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
        version: 2, category: 'all', positions: Array.from({ length: 4 }, () => ({ after: null, done: false })), window: Array.from({ length: 4 }, () => ({ end: 'abc', more: false })), after: 'abc', asOf: now.toISOString()
    });
    assert.equal(model.decodeAttentionCursor(encoded, 'all').after, 'abc');
    assert.throws(() => model.decodeAttentionCursor(encoded, 'delivery'));
    assert.throws(() => model.decodeAttentionCursor('garbage', 'all'));
});
test('handover is not receipt, and giverLogistics determines missing address', () => {
    const sources = { donorProfiles: { rows: [], state: 'complete', reason: null }, items: { rows: [], state: 'complete', reason: null }, itemRequests: {
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

function memoryFirestore(records: Record<string, any[]>) {
    let largestRead = 0;
    return {
        get largestRead() { return largestRead; },
        collection(name: string) {
            let after: string | null = null, end: string | null = null, limit = Infinity;
            const query = {
                orderBy() { return query; },
                startAfter(value: string) { after = value; return query; },
                endAt(value: string) { end = value; return query; },
                limit(value: number) { limit = value; return query; },
                async get() {
                    const rows = (records[name] ?? []).filter(d => (!after || d.id > after) && (!end || d.id <= end)).sort((a, b) => a.id.localeCompare(b.id)).slice(0, limit);
                    largestRead = Math.max(largestRead, rows.length);
                    return { size: rows.length, docs: rows.map(d => ({ id: d.id, data: () => d })) };
                }
            };
            return query;
        }
    };
}

test('attention advances past 51 cancelled records even when the first scanned window has no match', async () => {
    const records = Array.from({ length: 51 }, (_, i) => ({ id: `a-${String(i).padStart(3, '0')}`, status: 'cancelled' }));
    const db = memoryFirestore({ itemRequests: [...records, { id: 'z-overdue', status: 'approved', agreedSlotAt: '2020-01-01T00:00:00.000Z' }] });
    const first = await model.getAttention(db, 'delivery', 2);
    assert.deepEqual(first.items, []);
    assert.ok(first.nextCursor, 'a no-match source window must still advance');
    const second = await model.getAttention(db, 'delivery', 2, model.decodeAttentionCursor(first.nextCursor, 'delivery'));
    assert.deepEqual(second.items.map((d: any) => d.entity.id), ['z-overdue']);
    assert.equal(second.nextCursor, null);
    assert.ok(db.largestRead <= 51);
});

test('attention emits all records exactly once across priority pages and successive source windows', async () => {
    const claims = Array.from({ length: 55 }, (_, i) => ({ id: `claim-${String(i).padStart(3, '0')}`, status: 'pending', createdAt: new Date(now.getTime() - i * 1000).toISOString() }));
    const events = Array.from({ length: 52 }, (_, i) => ({ id: `event-${String(i).padStart(3, '0')}`, status: 'failed', channel: 'sms', claimId: claims[0].id }));
    const db = memoryFirestore({ itemRequests: claims, notificationEvents: events });
    const seen = new Set<string>();
    let cursor, rounds = 0;
    do {
        const page: { items: Array<{id: string}>; nextCursor: string | null } = await model.getAttention(db, 'all', 7, cursor);
        for (const row of page.items) { assert.ok(!seen.has(row.id), row.id); seen.add(row.id); }
        cursor = page.nextCursor ? model.decodeAttentionCursor(page.nextCursor, 'all') : undefined;
        assert.ok(++rounds < 30);
    } while (cursor);
    assert.equal(seen.size, 107);
    assert.ok(db.largestRead <= 51);
});

test('actioned contact messages are terminal', () => {
    assert.equal(model.attentionFromRecord('contactMessages', { id: 'handled', status: 'actioned' }, now), null);
});

test('tester profiles propagate their targets and IDs into drop and claim KPI eligibility', () => {
    const source = (rows: any[]) => ({ rows, state: 'complete', reason: null });
    const createdAt = new Date(now.getTime() - 1000).toISOString();
    const sources = {
        donorProfiles: source([{ id: 'tester-profile', email: 'relovedtotem@gmail.com', target: 'opaque-tester-target' }]),
        donationSubmissions: source([{ id: 'tester-drop', donorId: 'tester-profile', createdAt }, { id: 'tester-target-drop', donorTarget: 'opaque-tester-target', createdAt }, { id: 'real-drop', createdAt }]),
        items: source([{ id: 'tester-owned', donorId: 'tester-profile' }, { id: 'tester-target-owned', donorTarget: 'opaque-tester-target' }, { id: 'real-item' }]),
        itemRequests: source([{ id: 'real-claimer-on-tester-item', itemId: 'tester-owned', requesterTarget: 'real@synthetic.invalid', createdAt }, { id: 'real-claimer-on-tester-target-item', itemId: 'tester-target-owned', createdAt }, { id: 'tester-claim', itemId: 'real-item', requesterTarget: 'opaque-tester-target', createdAt }, { id: 'real-claim', itemId: 'real-item', createdAt }])
    };
    const view = model.buildOverview(sources, now, '7d');
    assert.equal(view.kpis.find((k: any) => k.id === 'drops').value, 1);
    assert.equal(view.kpis.find((k: any) => k.id === 'claims').value, 1);
    for (const dependency of ['donorProfiles', 'items']) {
        const incomplete = model.buildOverview({ ...sources, [dependency]: { ...sources[dependency as keyof typeof sources], state: 'partial' } }, now, '7d');
        assert.equal(incomplete.kpis.find((k: any) => k.id === 'claims').value, null);
        assert.match(incomplete.kpis.find((k: any) => k.id === 'claims').reason, /tester.*coverage/i);
    }
});

test('porter address prerequisites identify the giver and claimer before schedule attention', () => {
    const claim = { id: 'porter', status: 'approved', giverLogistics: 'porter_arranged', handoverStage: 'awaiting_address_confirm', requesterAddress: 'Synthetic receiver building', pickupAddressConfirmedByGiver: false, dropAddressConfirmedByClaimer: false };
    const pickup = model.attentionFromRecord('itemRequests', claim, now);
    assert.equal(pickup.type, 'pickup_address_unconfirmed');
    assert.match(pickup.nextAction.label, /giver/i);
    const drop = model.attentionFromRecord('itemRequests', { ...claim, pickupAddressConfirmedByGiver: true }, now);
    assert.equal(drop.type, 'delivery_address_unconfirmed');
    assert.match(drop.nextAction.label, /claimer/i);
    const ready = model.attentionFromRecord('itemRequests', { ...claim, pickupAddressConfirmedByGiver: true, dropAddressConfirmedByClaimer: true }, now);
    assert.equal(ready.type, 'missing_schedule');
    const address = model.attentionFromRecord('itemRequests', { id: 'giver-sends', status: 'approved', giverLogistics: 'giver_sends', handoverStage: 'awaiting_delivery_address' }, now);
    assert.equal(address.type, 'missing_address');
    assert.match(address.nextAction.label, /claimer/i);
});

test('admin delivery pickup address reads the canonical private pickupLocality', () => {
    const source = (rows: any[]) => ({ rows, state: 'complete', reason: null });
    const view = model.buildOverview({ itemRequests: source([{ id: 'pickup', status: 'approved', pickupLocality: 'Synthetic private address', agreedSlotAt: now.toISOString() }]) }, now, '7d');
    assert.equal(view.deliveries.today[0].pickupAddress, 'Synthetic private address');
});

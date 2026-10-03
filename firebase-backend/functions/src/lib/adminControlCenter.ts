import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import type { AdminOverviewSnapshot, AdminKpi, AttentionItem, AttentionCategory, ChannelAudit, CoverageState, DeliveryRow, OverviewRange, Page, SourceCoverage } from '../../../../shared/adminControlCenter';
import { isTesterDoc, isTesterIdentity } from './analyticsTesters';
import { normalizePhoneDigits } from './donorIdentity';
import { getPostHogAdminAnalytics } from './posthogAdminRead';
export type ReadRecord = {
    id: string;
    [key: string]: unknown;
};
export type SourceRead = {
    rows: ReadRecord[];
    state: CoverageState;
    reason: string | null;
};
export type Sources = Record<string, SourceRead>;
// Bounded document-ID scan budget per source collection — calibrated for QA fixtures (~50
// records). Production has already outgrown it on `items`, which cascades through
// metricSources() and marks Drops/Claims/Matched/Completed "unavailable". Raised to cover
// current + near-term production scale; a collection that outgrows this still degrades
// honestly to "unavailable" rather than showing a wrong number.
export const SOURCE_LIMIT = 1000;
const overviewSources = ['donorProfiles', 'donationSubmissions', 'items', 'itemRequests', 'notificationEvents', 'messageThreads', 'contactMessages'];
const attentionSources = ['itemRequests', 'notificationEvents', 'messageThreads', 'contactMessages'];
const scope = 'Bounded document-ID window: at most 50 records per source. Operational rows include testers; KPI identity filtering uses existing analytics tester rules. Reads are not a transactional snapshot.';
const str = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v : null;
export function iso(v: unknown): string | null {
    if (v == null)
        return null;
    try {
        const date = v instanceof Date ? v : typeof v === 'object' && typeof (v as {
            toDate?: unknown;
        }).toDate === 'function' ? (v as {
            toDate(): Date;
        }).toDate() : new Date(v as string);
        return Number.isFinite(date.getTime()) ? date.toISOString() : null;
    }
    catch {
        return null;
    }
}
export function timeWindows(now: Date) {
    const shifted = new Date(now.getTime() + 330 * 60000);
    const start = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - 330 * 60000;
    return {
        todayStart: new Date(start).toISOString(), todayEnd: new Date(start + 86400000).toISOString(), next48Start: now.toISOString(), next48End: new Date(now.getTime() + 172800000).toISOString()
    };
}
export function inWindow(value: unknown, start: string, end: string): boolean {
    const at = iso(value);
    return at !== null && at >= start && at < end;
}
function overall(states: CoverageState[]): CoverageState {
    return states.every(s => s === 'unavailable') ? 'unavailable' : states.every(s => s === 'complete') ? 'complete' : 'partial';
}
function coverage(sources: Sources): SourceCoverage[] {
    return Object.entries(sources).map(([source, s]) => ({
        source, state: s.state, scanned: s.rows.length, limit: SOURCE_LIMIT, reason: s.reason
    }));
}
export async function readSources(db: Firestore, names: string[]): Promise<Sources> {
    return Object.fromEntries(await Promise.all(names.map(async (name) => {
        try {
            // Ordering on document ID retains records that have no createdAt field. No composite index needed.
            // Tester exclusions are not indexed. A large KPI cohort cannot be counted honestly
            // without scanning; do not spend a document-read budget just to infer that total.
            if (['donorProfiles', 'donationSubmissions'].includes(name)) {
                const count = (await db.collection(name).count().get()).data().count;
                if (count > SOURCE_LIMIT)
                    return [name, {
                            rows: [], state: 'unavailable', reason: 'Identity-filtered aggregation unavailable above the 50-record small-cohort budget.'
                        }] as const;
            }
            const snap = await db.collection(name).orderBy(FieldPath.documentId()).limit(SOURCE_LIMIT + 1).get();
            const truncated = snap.size > SOURCE_LIMIT;
            return [name, {
                    rows: snap.docs.slice(0, SOURCE_LIMIT).map(d => ({ ...d.data(), id: d.id })), state: truncated ? 'partial' : 'complete', reason: truncated ? 'Source exceeds 50 records; this window is incomplete and cannot establish totals.' : null
                }] as const;
        }
        catch (error) {
            console.error('admin_control_center_source_unavailable', { source: name, code: (error as {
                    code?: unknown;
                }).code ?? 'unknown' });
            return [name, {
                    rows: [], state: 'unavailable', reason: 'Source read failed; no value inferred.'
                }] as const;
        }
    })));
}
export function notificationAudit(events: ReadRecord[], state: CoverageState): Record<'email' | 'sms', ChannelAudit> {
    const channel = (name: string): ChannelAudit => {
        const attempts = events.filter(e => e.channel === name && ['sent', 'failed', 'skipped'].includes(String(e.status))).map(e => ({
            id: e.id, status: e.status as 'sent' | 'failed' | 'skipped', at: iso(e.createdAt), templateKey: str(e.templateKey), audience: str(e.audience), destination: str(e.to), error: str(e.error)
        }))
            .sort((a, b) => (b.at || '').localeCompare(a.at || '') || a.id.localeCompare(b.id));
        return {
            state, counts: state === 'complete' ? {
                sent: attempts.filter(a => a.status === 'sent').length, failed: attempts.filter(a => a.status === 'failed').length, skipped: attempts.filter(a => a.status === 'skipped').length
            } : null, latest: state === 'complete' && attempts.every(a => a.at) ? attempts[0] ?? null : null, attempts
        };
    };
    return { email: channel('email'), sms: channel('sms') };
}
function completeDelivery(d: ReadRecord): boolean {
    return ['delivered', 'received'].includes(String(d.handoverStage)) || d.deliveryStatus === 'delivered' || d.opsBookingStatus === 'delivered';
}
const deliveryHref = (id: string) => `/admin/orders?claimId=${encodeURIComponent(id)}`;
export function attentionFromRecord(source: string, d: ReadRecord, now: Date): AttentionItem | null {
    let type = '', category: AttentionItem['category'] = 'claims', severity: AttentionItem['severity'] = 'warning', title = '', href = '', description = '', actionLabel = 'Review';
    const dueAt = iso(d.agreedSlotAt);
    if (source === 'notificationEvents' && ['failed', 'skipped'].includes(String(d.status))) {
        type = `notification_${d.status}`;
        category = 'messaging';
        title = `${d.channel === 'sms' ? 'SMS' : 'Email'} ${d.status}`;
        href = str(d.claimId) ? deliveryHref(String(d.claimId)) : '/admin/notifications';
        description = str(d.error) || `Audit records a ${d.status} attempt; recipient delivery is not confirmed.`;
    }
    else if (source === 'messageThreads' && d.subjectType === 'support' && d.unreadForAdmin === true) {
        type = 'unread_support';
        category = 'support';
        title = 'Unread support message';
        href = `/admin/messages?threadId=${encodeURIComponent(d.id)}`;
        description = str(d.lastMessagePreview) || 'Open the support conversation to review the message.';
    }
    else if (source === 'contactMessages' && !['closed', 'resolved', 'replied', 'actioned'].includes(String(d.status))) {
        type = 'open_contact';
        category = 'support';
        title = 'Contact message needs review';
        href = `/admin/messages?messageId=${encodeURIComponent(d.id)}`;
        description = str(d.message) || 'Open the website contact request.';
    }
    else if (source === 'itemRequests' && !['rejected', 'cancelled'].includes(String(d.status)) && !completeDelivery(d)) {
        href = deliveryHref(d.id);
        if (d.deliveryStatus === 'failed') {
            type = 'delivery_failed';
            category = 'delivery';
            severity = 'critical';
            title = 'Delivery failed';
        }
        else if (d.status === 'approved' && dueAt && dueAt < now.toISOString()) {
            type = 'overdue_delivery';
            category = 'delivery';
            severity = 'critical';
            title = 'Delivery is overdue';
        }
        else if (d.status === 'approved' && dueAt && inWindow(dueAt, now.toISOString(), new Date(now.getTime() + 3600000).toISOString())) {
            type = 'delivery_due_soon';
            category = 'delivery';
            title = 'Delivery due within an hour';
        }
        else if (d.status === 'pending') {
            type = 'waiting_claim';
            title = 'Claim awaiting review';
            href = `/admin/item-requests?claimId=${encodeURIComponent(d.id)}`;
        }
        else if (d.status === 'approved' &&
            (d.giverLogistics === 'porter_arranged' || d.deliveryMethod === 'reloved_courier') &&
            d.pickupAddressConfirmedByGiver !== true) {
            type = 'pickup_address_unconfirmed';
            title = 'Giver pickup address needs confirmation';
            actionLabel = 'Review giver pickup address';
        }
        else if (d.status === 'approved' &&
            ((['awaiting_address', 'awaiting_address_confirm', 'awaiting_delivery_address'].includes(String(d.handoverStage)) && d.dropAddressConfirmedByClaimer !== true) ||
                ((['giver_sends', 'porter_arranged'].includes(String(d.giverLogistics)) || ['giver_sends', 'reloved_courier'].includes(String(d.deliveryMethod))) && !str(d.requesterAddress)))) {
            type = str(d.requesterAddress) ? 'delivery_address_unconfirmed' : 'missing_address';
            title = str(d.requesterAddress) ? 'Claimer delivery address needs confirmation' : 'Claimer delivery address missing';
            actionLabel = 'Review claimer delivery address';
        }
        else if (d.status === 'approved' &&
            (d.giverLogistics === 'porter_arranged' || d.deliveryMethod === 'reloved_courier') &&
            d.dropAddressConfirmedByClaimer !== true) {
            type = 'delivery_address_unconfirmed';
            title = 'Claimer delivery address needs confirmation';
            actionLabel = 'Review claimer delivery address';
        }
        else if (d.status === 'approved' && !dueAt) {
            type = 'missing_schedule';
            title = 'Agreed schedule missing';
        }
    }
    if (!type)
        return null;
    const entityLabel = source === 'notificationEvents' ? 'Claim communication' : source === 'itemRequests' ? str(d.itemTitle) || 'Claim' : source === 'contactMessages' ? str(d.subject) || 'Website contact' : str(d.itemTitle) || 'Support conversation';
    const actions: AttentionItem['actions'] = [{ label: actionLabel, href, kind: 'view', primary: true }];
    if (source === 'itemRequests' && str(d.requesterPhone)) actions.push({ label: 'Contact people', href: `${href}#masked-calls`, kind: 'view', primary: false });
    return {
        id: `${source}:${d.id}:${type}`, category, severity, type, title, description: description || (str(d.itemTitle) ?? 'Review the source record to continue.'), entity: { type: source === 'notificationEvents' ? 'claim' : source, id: str(d.claimId) || d.id }, entityLabel, recorded: source === 'notificationEvents' ? { subject: str(d.subject), preview: str(d.previewBody), error: str(d.error) } : source === 'contactMessages' || source === 'messageThreads' ? { subject: str(d.subject), preview: str(d.message) || str(d.lastMessagePreview), error: null } : undefined, actions, occurredAt: iso(d.createdAt), dueAt, nextAction: { label: actionLabel, href }
    };
}
function attentionRows(sources: Sources, now: Date): AttentionItem[] {
    const rank = {
        critical: 0, warning: 1, info: 2
    };
    return attentionSources.flatMap(name => (sources[name]?.rows ?? []).map(d => attentionFromRecord(name, d, now)).filter((d): d is AttentionItem => d !== null))
        .sort((a, b) => rank[a.severity] - rank[b.severity] || (a.dueAt || a.occurredAt || '9999').localeCompare(b.dueAt || b.occurredAt || '9999') || a.id.localeCompare(b.id));
}
function deliveryRow(d: ReadRecord, sources: Sources): DeliveryRow {
    const item = sources.items?.rows.find(i => i.id === d.itemId);
    const submission = sources.donationSubmissions?.rows.find(s => s.id === item?.submissionId);
    const logs = sources.notificationEvents ?? {
        rows: [], state: 'unavailable' as const, reason: null
    };
    return {
        id: d.id, itemId: str(d.itemId), itemTitle: str(d.itemTitle) || str(item?.title), itemImages: Array.isArray(d.itemImages) ? d.itemImages : Array.isArray(item?.images) ? item.images : [], giverName: str(submission?.donorFirstName) || str(item?.donorFirstName), giverEmail: str(submission?.email), giverPhone: str(submission?.phone) || str(item?.donorPhone), requesterName: str(d.requesterName), requesterEmail: str(d.requesterEmail) || (String(d.requesterTarget).includes('@') ? str(d.requesterTarget) : null), requesterPhone: str(d.requesterPhone), pickupLocality: str(d.pickupLocality) || str(submission?.pickupLocality), pickupAddress: str(d.pickupLocality) || str(d.pickupAddress) || str(submission?.pickupLocality) || str(submission?.pickupAddress), requesterAddress: str(d.requesterAddress), logistics: str(d.giverLogistics) || str(d.deliveryMethod), status: str(d.deliveryStatus) || str(d.opsBookingStatus) || str(d.handoverStage), createdAt: iso(d.createdAt), updatedAt: iso(d.updatedAt), agreedSlotAt: iso(d.agreedSlotAt), proposedSlotAt: iso(d.proposedSlotAt), nextAction: { label: 'Open delivery', href: deliveryHref(d.id) }, notifications: notificationAudit(logs.rows.filter(e => e.claimId === d.id), logs.state)
    };
}
/** Match analytics' identity propagation without letting a partial join establish a KPI. */
function metricSources(sources: Sources): Sources {
    const normalize = (value: unknown) => String(value || '').trim().toLowerCase();
    const testerTargets = new Set<string>();
    const testerIds = new Set<string>();
    for (const profile of sources.donorProfiles?.rows ?? []) {
        if (!isTesterDoc(profile)) continue;
        testerIds.add(profile.id);
        for (const value of [profile.id, profile.target, profile.email, profile.phone, profile.username]) {
            if (normalize(value)) testerTargets.add(normalize(value));
        }
        const phone = normalizePhoneDigits(String(profile.phone || ''));
        if (phone) testerTargets.add(phone);
    }
    const excludedTarget = (value: unknown): boolean => {
        const target = normalize(value);
        const phone = normalizePhoneDigits(target);
        return !!target && (testerTargets.has(target) || !!phone && testerTargets.has(phone) || isTesterIdentity(value));
    };
    const eligibleDonorRecord = (record: ReadRecord) => !isTesterDoc(record) &&
        !excludedTarget(record.donorTarget || record.donorEmail || record.email || record.phone) &&
        !testerIds.has(String(record.donorId || ''));
    const keptItems = new Set((sources.items?.rows ?? []).filter(eligibleDonorRecord).map(record => record.id));
    const dependencies: Record<string, string[]> = {
        donorProfiles: [],
        donationSubmissions: ['donorProfiles'],
        itemRequests: ['donorProfiles', 'items']
    };
    return Object.fromEntries(Object.entries(dependencies).map(([name, prerequisites]) => {
        const original = sources[name] ?? { rows: [], state: 'unavailable' as const, reason: 'Source unavailable' };
        const missing = prerequisites.filter(source => sources[source]?.state !== 'complete');
        const state: CoverageState = missing.length ? 'unavailable' : original.state;
        const reason = missing.length ? `Tester eligibility coverage incomplete: ${missing.join(', ')}.` : original.reason;
        const rows = original.rows.filter(record => {
            if (name === 'donorProfiles') return !isTesterDoc(record);
            if (name === 'donationSubmissions') return eligibleDonorRecord(record);
            return !isTesterDoc(record) &&
                !excludedTarget(record.requesterTarget || record.requesterEmail || record.requesterPhone || record.email || record.phone) &&
                !excludedTarget(record.donorTarget) &&
                (!record.itemId || keptItems.has(String(record.itemId)));
        });
        return [name, { rows, state, reason }];
    }));
}
export function buildOverview(sources: Sources, now: Date, range: OverviewRange): AdminOverviewSnapshot {
    const asOf = now.toISOString(), rangeStart = new Date(now.getTime() - ({
        '24h': 1, '7d': 7, '30d': 30
    }[range]) * 86400000).toISOString(), windows = timeWindows(now);
    const eligibleSources = metricSources(sources);
    function metric(id: string, label: string, source: string, definition: string, href: string, ranged: boolean, predicate: (d: ReadRecord) => boolean = () => true, dateField = 'createdAt'): AdminKpi {
        const s = eligibleSources[source] ?? {
            rows: [], state: 'unavailable', reason: 'Source unavailable'
        };
        const rows = s.rows.filter(d => !isTesterDoc(d));
        const undated = ranged && rows.some(d => !iso(d[dateField]));
        const state = s.state !== 'complete' ? s.state : undated ? 'partial' : 'complete';
        return {
            id, label, value: state === 'complete' ? rows.filter(d => predicate(d) && (!ranged || inWindow(d[dateField], rangeStart, asOf))).length : null, state, reason: s.reason || (undated ? `Undated records prevent reliable ${dateField} range counts.` : null), definition, source, scope: ranged ? `[${rangeStart}, ${asOf}); known tester identities excluded` : 'All time; known tester identities excluded', href
        };
    }
    const kpis: AdminKpi[] = [
        metric('users', 'Users', 'donorProfiles', 'Profile documents; not unique people across identities.', '/admin/analytics', false),
        {
            id: 'activeUsers', label: 'Active users', value: null, state: 'unavailable', reason: 'No trusted activity event coverage for this definition.', definition: 'Unique people active in the selected range.', source: 'Unavailable', scope: range, href: '/admin/analytics'
        },
        metric('newUsers', 'New users', 'donorProfiles', 'Profiles created in the range.', '/admin/analytics', true),
        metric('drops', 'Drops', 'donationSubmissions', 'Donation submissions created in the range.', '/admin/donations', true),
        metric('claims', 'Claims', 'itemRequests', 'Claim requests created in the range.', '/admin/item-requests', true),
        metric('matched', 'Matched', 'itemRequests', 'Claims created in the range whose current status is approved; not matches occurring in the range.', '/admin/item-requests', true, d => d.status === 'approved'),
        metric('completed', 'Completed', 'itemRequests', 'Claims created in the range currently delivered or received; not completions occurring in the range.', '/admin/orders', true, completeDelivery),
    ];
    const claims = kpis.find(k => k.id === 'claims')!, matched = kpis.find(k => k.id === 'matched')!;
    kpis.push({
        id: 'acceptanceRate', label: 'Claim acceptance rate', value: claims.value && matched.value !== null ? Math.round(matched.value / claims.value * 10000) / 100 : null, state: claims.state === 'complete' && claims.value ? 'complete' : claims.state === 'complete' ? 'unavailable' : claims.state, reason: claims.reason || (!claims.value ? 'No dated claims in range; rate has no denominator.' : null), definition: 'Currently approved claims / claims created in range, percent.', source: 'itemRequests', scope: claims.scope, href: '/admin/item-requests'
    });
    const deliveries = (sources.itemRequests?.rows ?? []).filter(d => d.status === 'approved').map(d => deliveryRow(d, sources)).sort((a, b) => (a.agreedSlotAt || '9999').localeCompare(b.agreedSlotAt || '9999') || a.id.localeCompare(b.id));
    const attention = attentionRows(sources, now);
    return {
        asOf, coverage: overall(Object.values(sources).map(s => s.state)), sources: coverage(sources), scope, range, timezone: 'Asia/Kolkata', rangeStart, kpis, windows,
        deliveries: {
            state: overall(['itemRequests', 'items', 'donationSubmissions', 'notificationEvents'].map(n => sources[n]?.state ?? 'unavailable')), today: deliveries.filter(d => inWindow(d.agreedSlotAt, windows.todayStart, windows.todayEnd)), next48h: deliveries.filter(d => inWindow(d.agreedSlotAt, asOf, windows.next48End)), undated: deliveries.filter(d => !d.agreedSlotAt)
        },
        waitingOnPeople: attention.filter(a => a.category === 'claims'), messagingFailures: attention.filter(a => a.category === 'messaging')
    };
}
const documentIdSchema = z.string().min(1).max(1500).refine(value => !value.includes('/'));
const positionSchema = z.object({ after: documentIdSchema.nullable(), done: z.boolean() }).strict();
const windowSchema = z.object({ end: documentIdSchema.nullable(), more: z.boolean() }).strict();
const cursorSchema = z.object({
    version: z.literal(2),
    category: z.enum(['all', 'messaging', 'delivery', 'claims', 'support']),
    positions: z.array(positionSchema).length(attentionSources.length),
    window: z.array(windowSchema).length(attentionSources.length).nullable(),
    after: z.string().max(2000).nullable(),
    asOf: z.string().datetime()
}).strict().refine(value => value.window !== null || value.after === null);
export type AttentionCursor = z.infer<typeof cursorSchema>;
export function encodeAttentionCursor(cursor: AttentionCursor): string {
    return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}
export function decodeAttentionCursor(raw: string, category: AttentionCategory): AttentionCursor {
    if (raw.length > 24000 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error('Invalid cursor');
    const value = cursorSchema.parse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')));
    if (value.category !== category) throw new Error('Cursor category mismatch');
    return value;
}
function attentionKey(a: AttentionItem): string {
    return `${({ critical: 0, warning: 1, info: 2 })[a.severity]}|${a.dueAt || a.occurredAt || '9999'}|${a.id}`;
}
export async function getAttention(db: Firestore, category: AttentionCategory, limit: number, cursor?: AttentionCursor): Promise<Page<AttentionItem>> {
    const now = cursor ? new Date(cursor.asOf) : new Date();
    const positions = cursor?.positions ?? attentionSources.map(() => ({ after: null, done: false }));
    // A cursor pins each window's document-ID endpoints while its priority-sorted rows
    // are paged. Only after all those rows are emitted do the underlying scans advance.
    const reads = await Promise.all(attentionSources.map(async (name, index) => {
        const position = positions[index];
        const pinnedWindow = cursor?.window?.[index];
        let rows: ReadRecord[] = [];
        let more = false;
        let end: string | null = position.after;
        if (!position.done && (!pinnedWindow || pinnedWindow.end !== position.after)) {
            let query = db.collection(name).orderBy(FieldPath.documentId());
            if (position.after) query = query.startAfter(position.after);
            if (pinnedWindow?.end) query = query.endAt(pinnedWindow.end);
            // A failed scan rejects the request so no cursor can skip the failed source.
            const snap = await query.limit(pinnedWindow ? SOURCE_LIMIT : SOURCE_LIMIT + 1).get();
            rows = snap.docs.slice(0, SOURCE_LIMIT).map(doc => ({ ...doc.data(), id: doc.id }));
            more = pinnedWindow?.more ?? snap.size > SOURCE_LIMIT;
            end = pinnedWindow?.end ?? rows.at(-1)?.id ?? position.after;
        }
        const partial = !!position.after || more;
        const source: SourceRead = {
            rows,
            state: partial ? 'partial' : 'complete',
            reason: partial ? 'Continuation slice; priority is local to this window, not the entire source. Follow nextCursor even when items is empty.' : null
        };
        return { name, source, end, more };
    }));
    const sources = Object.fromEntries(reads.map(read => [read.name, read.source]));
    const rows = attentionRows(sources, now).filter(row =>
        (category === 'all' || row.category === category) &&
        (!cursor?.after || attentionKey(row).localeCompare(cursor.after) > 0));
    const items = rows.slice(0, limit);
    let nextCursor: string | null = null;
    if (rows.length > limit) {
        nextCursor = encodeAttentionCursor({
            version: 2, category, asOf: now.toISOString(), positions,
            window: reads.map(read => ({ end: read.end, more: read.more })),
            after: attentionKey(items[items.length - 1])
        });
    } else if (reads.some(read => read.more)) {
        nextCursor = encodeAttentionCursor({
            version: 2, category, asOf: now.toISOString(),
            positions: reads.map(read => ({ after: read.end, done: !read.more })),
            window: null, after: null
        });
    }
    return {
        asOf: now.toISOString(), coverage: overall(Object.values(sources).map(source => source.state)),
        sources: coverage(sources), scope, items, nextCursor,
        order: 'Severity, due/occurred time (undated last), ID within each advancing 50-record source window. Not global priority. Follow nextCursor on empty pages. Reads are live; edits can change rows.'
    };
}
export async function getOverview(db: Firestore, range: OverviewRange): Promise<AdminOverviewSnapshot> {
    const now = new Date();
    const sources = await readSources(db, overviewSources);
    const result = buildOverview(sources, now, range);
    // Schedule fields are canonical ISO strings in matchFlow. Single-field range ordering
    // avoids a composite-index dependency and never buries today's work behind old IDs.
    try {
        const window = result.windows;
        const snap = await db.collection('itemRequests')
            .where('agreedSlotAt', '>=', window.todayStart)
            .where('agreedSlotAt', '<', window.next48End)
            .orderBy('agreedSlotAt').limit(SOURCE_LIMIT + 1).get();
        const state: CoverageState = snap.size > SOURCE_LIMIT ? 'partial' : 'complete';
        const rows = snap.docs.slice(0, SOURCE_LIMIT).map(d => ({ ...d.data(), id: d.id } as ReadRecord))
            .filter(d => d.status === 'approved').map(d => deliveryRow(d, sources));
        result.deliveries.today = rows.filter(d => inWindow(d.agreedSlotAt, window.todayStart, window.todayEnd));
        result.deliveries.next48h = rows.filter(d => inWindow(d.agreedSlotAt, window.next48Start, window.next48End));
        result.deliveries.state = overall([result.deliveries.state, state]);
        result.sources.push({
            source: 'itemRequests.agreedSlotAt (today + next 48h)', state, scanned: Math.min(snap.size, SOURCE_LIMIT), limit: SOURCE_LIMIT, reason: state === 'partial' ? 'Schedule window exceeds 50 records.' : 'Canonical ISO schedule strings only; missing/invalid schedules are in the separate bounded undated queue.'
        });
    }
    catch (error) {
        console.error('admin_control_center_schedule_unavailable', { code: (error as {
                code?: unknown;
            }).code ?? 'unknown' });
        result.deliveries.today = [];
        result.deliveries.next48h = [];
        result.deliveries.state = 'unavailable';
        result.sources.push({
            source: 'itemRequests.agreedSlotAt (today + next 48h)', state: 'unavailable', scanned: 0, limit: SOURCE_LIMIT, reason: 'Schedule query failed; no empty schedule inferred.'
        });
    }
    // Active users rides on the independent PostHog adapter (own cache/timeout/failure
    // mode). A PostHog outage must not block the Firestore-backed KPIs above.
    const activeUsers = result.kpis.find(k => k.id === 'activeUsers');
    if (activeUsers) {
        try {
            const posthog = await getPostHogAdminAnalytics(range);
            if (posthog.status === 'connected' && typeof posthog.overview.uniqueVisitors === 'number') {
                activeUsers.value = posthog.overview.uniqueVisitors;
                activeUsers.state = 'complete';
                activeUsers.reason = null;
                activeUsers.source = 'PostHog';
            }
            else {
                activeUsers.reason = posthog.message || activeUsers.reason;
            }
        }
        catch (error) {
            console.error('admin_control_center_active_users_unavailable', { code: (error as {
                    code?: unknown;
                }).code ?? 'unknown' });
        }
    }
    result.coverage = overall(result.sources.map(s => s.state));
    return result;
}

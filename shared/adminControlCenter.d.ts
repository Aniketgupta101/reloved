/** Read-only contracts. Counts are never totals when a source is truncated or unavailable. */
export type CoverageState = 'complete' | 'partial' | 'unavailable';
export type OverviewRange = '24h' | '7d' | '30d';
export type AttentionCategory = 'all' | 'messaging' | 'delivery' | 'claims' | 'support';
export interface SourceCoverage {
    source: string;
    state: CoverageState;
    scanned: number;
    limit: number;
    reason: string | null;
}
export interface ReadMetadata {
    asOf: string;
    coverage: CoverageState;
    sources: SourceCoverage[];
    scope: string;
}
export interface AdminKpi {
    id: string;
    label: string;
    value: number | null;
    state: CoverageState;
    reason: string | null;
    definition: string;
    source: string;
    scope: string;
    href: string;
}
export interface NotificationAttempt {
    id: string;
    status: 'sent' | 'failed' | 'skipped';
    at: string | null;
    templateKey: string | null;
    audience: string | null;
    destination: string | null;
    error: string | null;
}
export interface ChannelAudit {
    state: CoverageState;
    counts: Record<'sent' | 'failed' | 'skipped', number> | null;
    latest: NotificationAttempt | null;
    attempts: NotificationAttempt[];
}
export interface DeliveryRow {
    id: string;
    itemId: string | null;
    itemTitle: string | null;
    itemImages: unknown[];
    giverName: string | null;
    giverEmail: string | null;
    giverPhone: string | null;
    requesterName: string | null;
    requesterEmail: string | null;
    requesterPhone: string | null;
    pickupLocality: string | null;
    pickupAddress: string | null;
    requesterAddress: string | null;
    logistics: string | null;
    status: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    agreedSlotAt: string | null;
    proposedSlotAt: string | null;
    nextAction: {
        label: string;
        href: string;
    };
    notifications: Record<'email' | 'sms', ChannelAudit>;
}
export interface AttentionItem {
    id: string;
    category: Exclude<AttentionCategory, 'all'>;
    severity: 'critical' | 'warning' | 'info';
    type: string;
    title: string;
    description: string;
    entity: {
        type: string;
        id: string;
    };
    occurredAt: string | null;
    dueAt: string | null;
    nextAction: {
        label: string;
        href: string;
    };
}
export interface Page<T> extends ReadMetadata {
    items: T[];
    nextCursor: string | null;
    order: string;
}
export interface AdminOverviewSnapshot extends ReadMetadata {
    range: OverviewRange;
    timezone: 'Asia/Kolkata';
    rangeStart: string;
    kpis: AdminKpi[];
    windows: {
        todayStart: string;
        todayEnd: string;
        next48Start: string;
        next48End: string;
    };
    deliveries: {
        state: CoverageState;
        today: DeliveryRow[];
        next48h: DeliveryRow[];
        undated: DeliveryRow[];
    };
    waitingOnPeople: AttentionItem[];
    messagingFailures: AttentionItem[];
}

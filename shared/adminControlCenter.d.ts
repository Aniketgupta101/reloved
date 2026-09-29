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
    /** Continue while non-null, even if items is empty. Priority is local to each scanned window. */
    nextCursor: string | null;
    order: string;
}
export type SupportView = 'unread' | 'open' | 'actioned' | 'all';
export interface SupportThreadSummary {
    id: string;
    sourceId: string;
    /** Identity passed to the existing admin support-thread open route. */
    chatSubjectId: string | null;
    source: 'ask_reloved' | 'contact_form';
    state: Exclude<SupportView, 'all'>;
    person: string;
    email: string | null;
    phone: string | null;
    subject: string;
    preview: string;
    occurredAt: string | null;
    linked: { itemId: string | null; dropId: string | null; claimId: string | null };
}
export interface AnalyticsMetric {
    id: string;
    label: string;
    value: number | null;
    source: string;
    definition: string;
    message: string | null;
}
export interface AnalyticsSnapshot extends ReadMetadata {
    range: '7d' | '30d';
    timezone: 'Asia/Kolkata';
    sections: {
        overview: AnalyticsMetric[];
        acquisition: AnalyticsMetric[];
        activation: AnalyticsMetric[];
        dropFunnel: AnalyticsMetric[];
        claimFunnel: AnalyticsMetric[];
        fulfillment: AnalyticsMetric[];
        retention: AnalyticsMetric[];
        supplyDemand: AnalyticsMetric[];
    };
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

export interface InventoryPerson {
  name: string | null;
  username: string | null;
  email: string | null;
  phone: string | null;
  locality: string | null;
}
export interface InventoryClaim {
  id: string;
  requesterName: string | null;
  status: string | null;
  handoverStage: string | null;
  agreedSlotAt: string | null;
  createdAt: string | null;
}
export interface WallAdminItem {
  id: string;
  submissionId: string | null;
  title: string;
  description: string | null;
  category: string | null;
  gender: string | null;
  size: string | null;
  condition: string | null;
  locality: string | null;
  status: string | null;
  publicStatus: string | null;
  publicVisibility: boolean | null;
  images: { storagePath: string }[];
  createdAt: string | null;
  updatedAt: string | null;
  dropper: InventoryPerson;
  claims: InventoryClaim[];
  claimsNextCursor: string | null;
  notifications: Record<"email" | "sms", ChannelAudit>;
  processing: string | null;
}
export interface DropAdminRow {
  id: string;
  reference: string | null;
  status: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  dropper: InventoryPerson;
  items: WallAdminItem[];
  itemsNextCursor: string | null;
  hasLinkedItems: boolean;
  internalNotes: string | null;
  unreadChat: boolean;
}
export type InventoryDetail = ReadMetadata & (DropAdminRow | WallAdminItem);
export interface DropFunnel extends ReadMetadata {
  steps: {
    id: string;
    label: string;
    value: number | null;
    source: string;
    reason: string | null;
  }[];
}

export interface InventoryClaimFocus extends ReadMetadata {
  claim: InventoryClaim & { requesterPhone: string | null; requesterEmail: string | null; requesterAddress: string | null; pickupAddress: string | null; logistics: string | null; opsBookingStatus: string | null; deliveryStatus: string | null };
  item: WallAdminItem | null;
  notifications: Record<"email" | "sms", ChannelAudit>;
}

export interface OperationAction {
  kind: 'review' | 'coordinate' | 'stage' | 'complete' | 'closed';
  label: string;
  opsStatus?: 'booked' | 'out_for_delivery' | 'delivered';
}
export interface OperationRow extends DeliveryRow {
  claimStatus: string | null;
  handoverStage: string | null;
  opsBookingStatus: string | null;
  deliveryStatus: string | null;
  note: string | null;
  opsNote: string | null;
  timing: 'completed' | 'overdue' | 'scheduled' | 'proposed' | 'unscheduled';
  action: OperationAction;
  map: { state: 'available' | 'unavailable'; reason: string; pickup: { latitude: number; longitude: number } | null; destination: { latitude: number; longitude: number } | null };
}
export interface CommunicationRow extends NotificationAttempt { channel: string; subject: string | null; previewBody: string | null; params: Record<string, string> }
export type OperationDetail = OperationRow & ReadMetadata;

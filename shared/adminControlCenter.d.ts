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
    entityLabel?: string | null;
    recorded?: { subject: string | null; preview: string | null; error: string | null };
    actions?: Array<{ label: string; href: string; kind: 'view' | 'mutation'; primary: boolean }>;
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
export interface SupportPage extends Page<SupportThreadSummary> {
    /** Exact direct document lookup for attention deep links; independent of page bounds. */
    focused: SupportThreadSummary | null;
}
export interface AnalyticsMetric {
    id: string;
    label: string;
    value: number | null;
    state: AnalyticsDataState;
    format: 'number' | 'percent' | 'duration' | 'milliseconds' | 'score' | 'bytes' | 'position';
    previousValue: number | null;
    changePercent: number | null;
    source: string;
    definition: string;
    message: string | null;
}
export type AnalyticsDataState = 'ready' | 'partial' | 'unavailable' | 'not_configured' | 'insufficient_data';
export interface AnalyticsSectionMeta {
    state: AnalyticsDataState;
    message: string | null;
    source: string;
}
export interface AnalyticsSeriesPoint {
    at: string;
    value: number | null;
}
export interface AnalyticsSeries {
    id: string;
    label: string;
    color: 'ink' | 'pink' | 'green' | 'amber' | 'blue';
    points: AnalyticsSeriesPoint[];
}
export interface AnalyticsRankedRow {
    id: string;
    label: string;
    value: number;
    secondaryValue: number | null;
    secondaryLabel: string | null;
}
export interface AnalyticsFunnelStep {
    id: string;
    label: string;
    value: number | null;
    rateFromPrevious: number | null;
    state: AnalyticsDataState;
    message: string | null;
}
export interface AnalyticsFunnel {
    id: 'drop' | 'claim';
    label: string;
    state: AnalyticsDataState;
    message: string | null;
    steps: AnalyticsFunnelStep[];
}
export interface AnalyticsComparisonRow {
    id: string;
    label: string;
    supply: number;
    demand: number;
}
export interface AnalyticsDeviceSnapshot {
    device: 'mobile' | 'desktop';
    state: AnalyticsDataState;
    message: string | null;
    metrics: AnalyticsMetric[];
}
export interface AnalyticsHealthIssue {
    id: string;
    label: string;
    count: number | null;
    severity: 'critical' | 'warning' | 'info';
    href: string | null;
    message: string | null;
}
export interface AnalyticsIntegrationStatus {
    id: string;
    label: string;
    status: 'healthy' | 'degraded' | 'unavailable' | 'not_configured';
    detail: string;
    checkedAt: string | null;
}
export interface AnalyticsSnapshot extends ReadMetadata {
    range: '7d' | '14d' | '30d';
    timezone: 'Asia/Kolkata';
    period: {
        from: string;
        to: string;
        previousFrom: string;
        previousTo: string;
    };
    sections: {
        overview: AnalyticsSectionMeta & {
            metrics: AnalyticsMetric[];
            traffic: AnalyticsSeries[];
            activity: AnalyticsSeries[];
            conversion: AnalyticsMetric[];
            topPages: AnalyticsRankedRow[];
            topInteractions: AnalyticsRankedRow[];
        };
        traffic: AnalyticsSectionMeta & {
            metrics: AnalyticsMetric[];
            trend: AnalyticsSeries[];
            topPages: AnalyticsRankedRow[];
            referrers: AnalyticsRankedRow[];
            campaigns: AnalyticsRankedRow[];
        };
        funnels: AnalyticsSectionMeta & {
            activation?: AnalyticsMetric[];
            drop: AnalyticsFunnel;
            claim: AnalyticsFunnel;
        };
        search: AnalyticsSectionMeta & {
            reportingPeriod: { from: string; to: string } | null;
            latencyNote: string | null;
            metrics: AnalyticsMetric[];
            trend: AnalyticsSeries[];
            queries: AnalyticsRankedRow[];
            landingPages: AnalyticsRankedRow[];
        };
        performance: AnalyticsSectionMeta & {
            field: AnalyticsSectionMeta & { devices: AnalyticsDeviceSnapshot[] };
            lab: AnalyticsSectionMeta & { devices: AnalyticsDeviceSnapshot[] };
            bundles: AnalyticsSectionMeta & {
                metrics: AnalyticsMetric[];
                assets: AnalyticsRankedRow[];
                warning: string | null;
            };
        };
        product: AnalyticsSectionMeta & {
            metrics: AnalyticsMetric[];
            categories: AnalyticsComparisonRow[];
            audiences: AnalyticsComparisonRow[];
            sizes: AnalyticsComparisonRow[];
            dropAreas: AnalyticsRankedRow[];
            claimAreas: AnalyticsRankedRow[];
            wallStatus: AnalyticsRankedRow[];
            claimPipeline?: AnalyticsRankedRow[];
            roles?: AnalyticsRankedRow[];
            roleCoverage?: string;
            attention?: AnalyticsHealthIssue[];
            attentionItems?: Array<{ id: string; label: string; href: string }>;
        };
        dataHealth: AnalyticsSectionMeta & {
            metrics: AnalyticsMetric[];
            issues: AnalyticsHealthIssue[];
            integrations: AnalyticsIntegrationStatus[];
            lastAnalyticsActivityAt: string | null;
            lastNotificationActivityAt: string | null;
        };
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
export interface CourierState {
  bookedVia: string | null;
  borzo: { orderId: string | null; orderName: string | null; status: string | null; deliveryStatus: string | null; trackingUrl: string | null; deliveryFee: number | null; courierName: string | null; courierPhone: string | null; bookedAt: string | null; updatedAt: string | null };
  shiprocket: { orderId: string | null; shipmentId: string | null; channelOrderId: string | null; status: string | null; awb: string | null; courierName: string | null; trackingUrl: string | null; paymentMethod: string | null; walletBalanceAtBook: number | null; assignError: string | null; bookedAt: string | null; updatedAt: string | null };
  shadowfax: { orderId: string | null; status: string | null; awb: string | null; trackingUrl: string | null; paymentMethod: string | null; bookedAt: string | null; updatedAt: string | null };
  payment: { paidBy: string | null; subsidyIndex: number | null; subsidyReleased: boolean | null };
}
export interface CourierPrerequisites {
  pickupAddress: string | null;
  dropAddress: string | null;
  pickupPincode: string | null;
  dropPincode: string | null;
  /** Partial means a source such as a linked profile was not available to this adapter. */
  state: 'complete' | 'partial';
}
export interface OperationRow extends DeliveryRow {
  courier: CourierState;
  courierPrerequisites: CourierPrerequisites;
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

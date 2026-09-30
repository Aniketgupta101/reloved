import { FieldPath, Timestamp, type Firestore } from "firebase-admin/firestore";
import { isTesterDoc } from "./analyticsTesters";
import { iso, type ReadRecord } from "./adminControlCenter";
import { collections } from "./firestore";
import { dayKey } from "./analyticsDaily";

export type SourceState = "complete" | "partial" | "unavailable";
export type ReadSource = { rows: ReadRecord[]; state: SourceState; reason: string | null };
export type SupportView = "unread" | "open" | "actioned" | "all";

const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;

export function supportRow(kind: "chat" | "contact", record: ReadRecord) {
  const status = String(record.status || "").toLowerCase();
  const actioned = status === "actioned" || status === "resolved";
  const unread = kind === "chat" ? record.unreadForAdmin === true : status === "new" || status === "unread";
  return {
    id: `${kind}:${record.id}`,
    sourceId: record.id,
    source: kind === "chat" ? "ask_reloved" as const : "contact_form" as const,
    chatSubjectId: kind === "chat" ? text(record.ownerTarget) || text(record.subjectId) : null,
    state: unread ? "unread" as const : actioned ? "actioned" as const : "open" as const,
    person: text(record.ownerName) || text(record.name) || "Visitor",
    email: text(record.ownerEmail) || text(record.participantEmail) || text(record.email),
    phone: text(record.ownerTarget) || text(record.phone),
    subject: text(record.subject) || (kind === "chat" ? "Ask Reloved" : "General inquiry"),
    preview: text(record.lastMessagePreview) || text(record.message) || "No message preview",
    occurredAt: kind === "chat"
      ? iso(record.lastMessageAt) || iso(record.createdAt)
      : iso(record.createdAt),
    linked: {
      itemId: text(record.itemId), dropId: text(record.submissionId), claimId: text(record.claimId),
    },
  };
}

export function supportMatches(row: ReturnType<typeof supportRow>, view: SupportView) {
  return view === "all" || row.state === view || (view === "open" && row.state === "unread");
}

export type SupportFocus = { threadId?: string; messageId?: string };

/** Resolve a deep-linked support source directly by document ID; never scan the inbox. */
export async function getFocusedSupport(db: Firestore, focus?: SupportFocus) {
  if (!focus?.threadId && !focus?.messageId) return null;
  const kind = focus.threadId ? "chat" as const : "contact" as const;
  const id = focus.threadId || focus.messageId!;
  const collection = kind === "chat" ? collections.messageThreads : collections.contactMessages;
  const snap = await db.collection(collection).doc(id).get();
  if (!snap.exists) return null;
  const record = { ...snap.data(), id: snap.id } as ReadRecord;
  if (isTesterDoc(record) || (kind === "chat" && record.subjectType !== "support")) return null;
  return supportRow(kind, record);
}

type Position = { seconds: number; nanoseconds: number; id: string };
type SupportCursor = { v: 3; view: SupportView; chatAfter: Position | null; contactAfter: Position | null };
export const encodeSupportCursor = (cursor: SupportCursor) => Buffer.from(JSON.stringify(cursor)).toString("base64url");
export function decodeSupportCursor(value: string, view: SupportView): SupportCursor {
  const parsed = JSON.parse(Buffer.from(value, "base64url").toString()) as Partial<SupportCursor>;
  if (parsed.v !== 3 || parsed.view !== view || !Object.prototype.hasOwnProperty.call(parsed, "chatAfter") || !Object.prototype.hasOwnProperty.call(parsed, "contactAfter")) throw new Error("Invalid cursor");
  for (const position of [parsed.chatAfter, parsed.contactAfter]) {
    if (position === null) continue;
    if (!position || !Number.isInteger(position.seconds) || !Number.isInteger(position.nanoseconds) || position.nanoseconds < 0 || position.nanoseconds >= 1_000_000_000 || typeof position.id !== "string" || !position.id || position.id.length > 1500 || position.id.includes("/")) throw new Error("Invalid cursor");
  }
  return parsed as SupportCursor;
}

const positionOf = (record: ReadRecord, field: "lastMessageAt" | "createdAt"): Position | null => {
  const value = record[field] as any;
  if (value && Number.isInteger(value.seconds) && Number.isInteger(value.nanoseconds)) return { seconds: value.seconds, nanoseconds: value.nanoseconds, id: record.id };
  const parsed = iso(value);
  if (!parsed) return null;
  const timestamp = Timestamp.fromDate(new Date(parsed));
  return { seconds: timestamp.seconds, nanoseconds: timestamp.nanoseconds, id: record.id };
};

async function supportWindow(db: Firestore, kind: "chat" | "contact", view: SupportView, after: Position | null, limit: number) {
  const collection = kind === "chat" ? collections.messageThreads : collections.contactMessages;
  const field = kind === "chat" ? "lastMessageAt" : "createdAt";
  const batchSize = Math.min(50, Math.max(10, limit + 1));
  const maxScanned = 500;
  let position = after;
  let exhausted = false;
  let scanned = 0;
  const rows: ReturnType<typeof supportRow>[] = [];
  const positions = new Map<string, Position>();
  while (!exhausted && scanned < maxScanned && rows.length < limit + 1) {
    let query: any = db.collection(collection);
    if (kind === "chat") query = query.where("subjectType", "==", "support");
    query = query.orderBy(field, "desc").orderBy(FieldPath.documentId(), "desc");
    if (position) query = query.startAfter(new Timestamp(position.seconds, position.nanoseconds), position.id);
    const snap = await query.limit(batchSize).get();
    exhausted = snap.size < batchSize;
    if (!snap.size) break;
    for (const doc of snap.docs) {
      const record = { ...doc.data(), id: doc.id } as ReadRecord;
      scanned += 1;
      position = positionOf(record, field);
      if (!isTesterDoc(record)) {
        const row = supportRow(kind, record);
        if (supportMatches(row, view)) {
          rows.push(row);
          const exact = positionOf(record, field);
          if (exact) positions.set(row.sourceId, exact);
        }
      }
      if (scanned >= maxScanned || rows.length >= limit + 1) break;
    }
  }
  return { rows, positions, exhausted, scanned, scannedAfter: position, state: !exhausted && scanned >= maxScanned ? "partial" as const : "complete" as const };
}

export async function getSupportPage(db: Firestore, view: SupportView, limit = 20, cursor?: SupportCursor, focus?: SupportFocus) {
  const [chats, contacts, focused] = await Promise.all([
    supportWindow(db, "chat", view, cursor?.chatAfter || null, limit),
    supportWindow(db, "contact", view, cursor?.contactAfter || null, limit),
    getFocusedSupport(db, focus),
  ]);
  const merged = mergeSupportCandidates(chats.rows, contacts.rows, limit);
  const items = merged.items;
  const selected = new Set(items.map((row) => row.id));
  const lastSelected = (rows: ReturnType<typeof supportRow>[], positions: Map<string, Position>) => {
    const row = [...rows].reverse().find(candidate => selected.has(candidate.id));
    return row ? positions.get(row.sourceId) || null : null;
  };
  const chatSelected = lastSelected(chats.rows, chats.positions);
  const contactSelected = lastSelected(contacts.rows, contacts.positions);
  const chatAfter = chatSelected || (chats.rows.length ? cursor?.chatAfter || null : chats.scannedAfter) || cursor?.chatAfter || null;
  const contactAfter = contactSelected || (contacts.rows.length ? cursor?.contactAfter || null : contacts.scannedAfter) || cursor?.contactAfter || null;
  const hasMore = merged.pendingChatIds.length > 0 || merged.pendingContactIds.length > 0 || !chats.exhausted || !contacts.exhausted;
  const nextCursor = hasMore ? encodeSupportCursor({ v: 3, view, chatAfter, contactAfter }) : null;
  const coverage: SourceState = chats.state === "partial" || contacts.state === "partial" ? "partial" : "complete";
  return {
    asOf: new Date().toISOString(), coverage,
    sources: [
      { source: "messageThreads(subjectType=support, lastMessageAt desc)", state: chats.state, scanned: chats.scanned, limit: 500, reason: chats.state === "partial" ? "Scan cap reached; continue to inspect older matching conversations." : null },
      { source: "contactMessages(createdAt desc)", state: contacts.state, scanned: contacts.scanned, limit: 500, reason: contacts.state === "partial" ? "Scan cap reached; continue to inspect older matching conversations." : null },
    ],
    scope: "Ask Reloved support threads and website contact forms. Operational drop and claim chats are excluded.",
    items, focused, nextCursor, order: "Latest Ask Reloved message or contact form submission; exact timestamp and document ID cursor",
  };
}

export function mergeSupportCandidates(chats: ReturnType<typeof supportRow>[], contacts: ReturnType<typeof supportRow>[], limit: number) {
  const items = [...chats, ...contacts].sort((a, b) => String(b.occurredAt || "").localeCompare(String(a.occurredAt || "")) || b.id.localeCompare(a.id)).slice(0, limit);
  const selected = new Set(items.map((row) => row.id));
  return { items, pendingChatIds: chats.filter((row) => !selected.has(row.id)).map((row) => row.sourceId), pendingContactIds: contacts.filter((row) => !selected.has(row.id)).map((row) => row.sourceId) };
}

const inRangeAt = (record: ReadRecord, fields: string[], start: number, end: number) => {
  const value = fields.map(field => iso(record[field])).find(Boolean);
  if (!value) return false;
  const at = Date.parse(value);
  return at >= start && at < end;
};
const finished = (r: ReadRecord) => [r.handoverStage, r.opsBookingStatus, r.deliveryStatus, r.status].some((v) => ["delivered", "completed", "reloved"].includes(String(v || "").toLowerCase()));
type Metric = { id: string; label: string; value: number | null; state: "ready" | "partial" | "unavailable" | "not_configured" | "insufficient_data"; format: "number" | "percent" | "duration" | "milliseconds" | "score" | "bytes" | "position"; previousValue: number | null; changePercent: number | null; source: string; definition: string; message: string | null };
const unavailable = (id: string, label: string, source: string, definition: string, reason = "Not enough reliable data yet."): Metric => ({ id, label, value: null, state: "insufficient_data", format: "number", previousValue: null, changePercent: null, source, definition, message: reason });
const metric = (id: string, label: string, value: number, source: string, definition: string): Metric => ({ id, label, value, state: "ready", format: "number", previousValue: null, changePercent: null, source, definition, message: null });

export function buildAnalyticsSnapshot(sources: Record<string, ReadSource>, now: Date, range: "7d" | "30d") {
  const days = range === "7d" ? 7 : 30;
  const start = now.getTime() - days * 86400000;
  const end = now.getTime();
  const src = (name: string) => sources[name] || { rows: [], state: "unavailable" as const, reason: "Source unavailable" };
  const usable = (name: string) => src(name).state === "complete";
  const raw = (name: string) => src(name).rows;
  const identity = (value: unknown) => String(value || "").trim().toLowerCase();
  const profiles = raw("donorProfiles");
  const testerIds = new Set(profiles.filter(isTesterDoc).map((r) => r.id));
  const testerTargets = new Set(profiles.filter(isTesterDoc).flatMap((r) => [r.target, r.email, r.phone, r.username].map(identity)).filter(Boolean));
  const testerIdentity = (value: unknown) => testerTargets.has(identity(value));
  const ownedByTester = (r: ReadRecord) => isTesterDoc(r) || testerIds.has(String(r.donorId || "")) || [r.donorTarget, r.donorEmail, r.email, r.phone].some(testerIdentity);
  const users = profiles.filter((r) => !isTesterDoc(r));
  const drops = raw("donationSubmissions").filter((r) => !ownedByTester(r));
  const items = raw("items").filter((r) => !ownedByTester(r));
  const keptItemIds = new Set(items.map((r) => r.id));
  const claims = raw("itemRequests").filter((r) => !isTesterDoc(r) && ![r.requesterTarget, r.requesterEmail, r.requesterPhone, r.donorTarget].some(testerIdentity) && (!r.itemId || keptItemIds.has(String(r.itemId))));
  const events = raw("notificationEvents").filter((r) => !isTesterDoc(r));
  const eventTotal = (name: string) => raw("analyticsDaily").reduce((sum, r) => sum + (typeof r[`e_${name}`] === "number" ? Number(r[`e_${name}`]) : 0), 0);
  const dropsUsable = usable("donorProfiles") && usable("donationSubmissions");
  const itemsUsable = usable("donorProfiles") && usable("items");
  const claimsUsable = usable("donorProfiles") && usable("items") && usable("itemRequests");
  const section = {
    overview: [
      usable("donorProfiles") ? metric("users", "Users", users.length, "donorProfiles", "Current all-time snapshot of known non-test profiles") : unavailable("users", "Users", "donorProfiles", "Current known non-test profiles", src("donorProfiles").reason || undefined),
      dropsUsable ? metric("drops", "Drops", drops.filter((r) => inRangeAt(r, ["submittedAt"], start, end)).length, "donationSubmissions + donorProfiles", `Drops whose submittedAt is in the last ${days} days`) : unavailable("drops", "Drops", "donationSubmissions + donorProfiles", "Drops submitted in range after tester exclusion"),
      claimsUsable ? metric("claims", "Claims", claims.filter((r) => inRangeAt(r, ["createdAt", "submittedAt"], start, end)).length, "itemRequests + items + donorProfiles", `Claims submitted in the last ${days} days`) : unavailable("claims", "Claims", "itemRequests + items + donorProfiles", "Claims in range after tester exclusion"),
      claimsUsable ? metric("reloved", "Reloved", claims.filter(finished).length, "itemRequests + items + donorProfiles", "Current all-time snapshot of claims with recorded delivery completion") : unavailable("reloved", "Reloved", "itemRequests + items + donorProfiles", "Current completed claims after tester exclusion"),
    ],
    acquisition: [unavailable("attribution", "Acquisition attribution", "Unavailable", "Attributed new users by channel")],
    activation: [usable("donorProfiles") ? metric("onboarded", "Profiles completed", users.filter((r) => r.onboardedAt || r.profileComplete === true).length, "donorProfiles", "Current all-time snapshot of profiles with onboarding completion evidence") : unavailable("onboarded", "Profiles completed", "donorProfiles", "Current completed onboarding")],
    dropFunnel: [
      usable("analyticsDaily") ? metric("dropStarted", "Drop started", eventTotal("donation_started"), "analyticsDaily", `Mirrored donation_started events in the last ${days} days`) : unavailable("dropStarted", "Drop started", "analyticsDaily", "Mirrored donation_started event count"),
      dropsUsable ? metric("submitted", "Submitted", drops.filter((r) => inRangeAt(r, ["submittedAt"], start, end)).length, "donationSubmissions + donorProfiles", `Persisted submissions by submittedAt in the last ${days} days`) : unavailable("submitted", "Submitted", "donationSubmissions + donorProfiles", "Persisted submissions after tester exclusion"),
      itemsUsable ? metric("visible", "Visible on Wall", items.filter((r) => r.publicVisibility === true).length, "items + donorProfiles", "Current all-time snapshot of visible inventory") : unavailable("visible", "Visible on Wall", "items + donorProfiles", "Current visible inventory after tester exclusion"),
    ],
    claimFunnel: [
      usable("analyticsDaily") ? metric("itemViewed", "Item viewed", eventTotal("item_viewed"), "analyticsDaily", `Mirrored item_viewed events in the last ${days} days`) : unavailable("itemViewed", "Item viewed", "analyticsDaily", "Mirrored item_viewed event count"),
      usable("analyticsDaily") ? metric("claimStarted", "Claim started", eventTotal("claim_started"), "analyticsDaily", `Mirrored claim_started events in the last ${days} days`) : unavailable("claimStarted", "Claim started", "analyticsDaily", "Mirrored claim_started event count"),
      claimsUsable ? metric("claimSubmitted", "Claim submitted", claims.filter((r) => inRangeAt(r, ["createdAt", "submittedAt"], start, end)).length, "itemRequests + items + donorProfiles", `Persisted claims submitted in the last ${days} days`) : unavailable("claimSubmitted", "Claim submitted", "itemRequests + items + donorProfiles", "Persisted claims after tester exclusion"),
      claimsUsable ? metric("matched", "Matched", claims.filter((r) => ["approved", "matched"].includes(String(r.status || "").toLowerCase())).length, "itemRequests + items + donorProfiles", "Current all-time snapshot of accepted or matched claims") : unavailable("matched", "Matched", "itemRequests + items + donorProfiles", "Current matched claims after tester exclusion"),
    ],
    fulfillment: [
      claimsUsable ? metric("delivered", "Delivered / Reloved", claims.filter(finished).length, "itemRequests + items + donorProfiles", "Current all-time snapshot of claims with completion evidence") : unavailable("delivered", "Delivered / Reloved", "itemRequests + items + donorProfiles", "Current completed claims after tester exclusion"),
      usable("notificationEvents") ? metric("failedComms", "Failed communications", events.filter((r) => r.status === "failed" && inRangeAt(r, ["createdAt", "sentAt", "updatedAt"], start, end)).length, "notificationEvents", `Recorded failed email and SMS attempts in the last ${days} days`) : unavailable("failedComms", "Failed communications", "notificationEvents", "Failed attempts in range"),
    ],
    retention: [unavailable("retention", "Retention", "Unavailable", "Cohort return rate")],
    supplyDemand: itemsUsable && claimsUsable ? [
      metric("availableSupply", "Available supply", items.filter((r) => r.publicVisibility === true && r.publicStatus === "available").length, "items + donorProfiles", "Current all-time snapshot of visible available inventory"),
      metric("claimDemand", "Claim demand", claims.filter((r) => inRangeAt(r, ["createdAt", "submittedAt"], start, end)).length, "itemRequests + items + donorProfiles", `Claims submitted in the last ${days} days`),
    ] : [unavailable("supplyDemand", "Supply & demand", "items + itemRequests", "Available inventory and claim demand")],
  };
  const all = Object.values(sources);
  const coverage: SourceState = all.some((s) => s.state === "unavailable" || s.state === "partial") ? "partial" : "complete";
  const sectionMeta = (state: "ready" | "partial" | "unavailable" | "not_configured" | "insufficient_data", source: string, message: string | null = null) => ({ state, source, message });
  const funnel = (id: "drop" | "claim", label: string, metrics: Metric[]) => {
    let previous: number | null = null;
    return {
      id, label,
      state: metrics.some((entry) => entry.value === null) ? "partial" as const : "ready" as const,
      message: metrics.some((entry) => entry.value === null) ? "Some stages do not have reliable mirrored evidence yet." : null,
      steps: metrics.map((entry) => {
        const rateFromPrevious = entry.value !== null && previous !== null && previous > 0 && entry.value <= previous ? entry.value / previous * 100 : null;
        previous = entry.value;
        return { id: entry.id, label: entry.label, value: entry.value, rateFromPrevious, state: entry.state, message: entry.message };
      }),
    };
  };
  const daily = raw("analyticsDaily").slice().sort((a, b) => a.id.localeCompare(b.id));
  const series = (id: string, label: string, color: "ink" | "pink" | "green" | "amber" | "blue", field: string) => ({ id, label, color, points: daily.map((row) => ({ at: row.id, value: typeof row[field] === "number" ? Number(row[field]) : 0 })) });
  const categorySupply = new Map<string, number>();
  const categoryDemand = new Map<string, number>();
  for (const item of items) {
    const label = text(item.category) || "Unknown";
    categorySupply.set(label, (categorySupply.get(label) || 0) + 1);
  }
  for (const claim of claims) {
    const item = items.find((candidate) => candidate.id === String(claim.itemId || ""));
    const label = text(item?.category || claim.itemCategory) || "Unknown";
    categoryDemand.set(label, (categoryDemand.get(label) || 0) + 1);
  }
  const categories = [...new Set([...categorySupply.keys(), ...categoryDemand.keys()])].map((label) => ({ id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"), label, supply: categorySupply.get(label) || 0, demand: categoryDemand.get(label) || 0 }));
  const wallStatus = ["available", "being_matched", "claimed", "reloved", "other"].map((status) => ({ id: status, label: status.replace(/_/g, " "), value: status === "other" ? items.filter((item) => !["available", "being_matched", "claimed", "reloved"].includes(String(item.publicStatus || ""))).length : items.filter((item) => item.publicStatus === status).length, secondaryValue: null, secondaryLabel: null }));
  const failedCommunications = events.filter((event) => event.status === "failed").length;
  const newUsers = usable("donorProfiles") ? metric("newUsers", "New users", users.filter((row) => inRangeAt(row, ["createdAt", "onboardedAt"], start, end)).length, "donorProfiles", `Profiles created in the last ${days} days`) : unavailable("newUsers", "New users", "donorProfiles", "Profiles created in range");
  const matched = claimsUsable ? metric("matched", "Matched", claims.filter((row) => ["approved", "matched"].includes(String(row.status || "").toLowerCase())).length, "itemRequests + items + donorProfiles", "Current matched claims") : unavailable("matched", "Matched", "itemRequests + items + donorProfiles", "Current matched claims");
  const conversion = [
    claimsUsable ? { ...metric("claimAcceptance", "Claim acceptance rate", claims.length ? claims.filter((row) => ["approved", "matched"].includes(String(row.status || "").toLowerCase())).length / claims.length * 100 : 0, "itemRequests", "Matched claims divided by recorded claims"), format: "percent" as const } : unavailable("claimAcceptance", "Claim acceptance rate", "itemRequests", "Matched claims divided by recorded claims"),
  ];
  const integrations = [
    { id: "firestore", label: "Firestore", status: coverage === "complete" ? "healthy" as const : "degraded" as const, detail: coverage === "complete" ? "All bounded reads completed." : "One or more bounded reads are incomplete.", checkedAt: now.toISOString() },
    { id: "brevo", label: "Brevo", status: "unavailable" as const, detail: "Send and vendor health checks are disabled in analytics reads.", checkedAt: now.toISOString() },
    { id: "msg91", label: "MSG91", status: "unavailable" as const, detail: "Send and vendor health checks are disabled in analytics reads.", checkedAt: now.toISOString() },
    { id: "edesy", label: "Edesy", status: "unavailable" as const, detail: "Call attempts are disabled in analytics reads.", checkedAt: now.toISOString() },
    { id: "couriers", label: "Courier adapters", status: "unavailable" as const, detail: "Bookings are disabled in analytics reads.", checkedAt: now.toISOString() },
    { id: "posthog", label: "PostHog", status: "not_configured" as const, detail: "A backend query credential is not configured.", checkedAt: now.toISOString() },
    { id: "searchConsole", label: "Search Console", status: "not_configured" as const, detail: "Backend Search Console read access is not configured.", checkedAt: now.toISOString() },
  ];
  const notConfiguredMetric = (id: string, label: string, source: string) => ({ ...unavailable(id, label, source, label), state: "not_configured" as const, message: `${source} read access is not configured.` });
  const lastAnalytics = daily.filter((row) => Object.entries(row).some(([key, value]) => key !== "id" && typeof value === "number" && value > 0)).at(-1)?.id || null;
  const lastNotification = events.map((event) => iso(event.createdAt || event.sentAt || event.updatedAt)).filter(Boolean).sort().at(-1) || null;
  return {
    asOf: now.toISOString(), range, timezone: "Asia/Kolkata" as const, coverage,
    sources: Object.entries(sources).map(([source, value]) => ({ source, state: value.state, scanned: value.rows.length, limit: 1501, reason: value.reason })),
    scope: `Operational Firestore truth and mirrored analytics events for the last ${days} days.`,
    period: { from: new Date(start).toISOString().slice(0, 10), to: now.toISOString().slice(0, 10), previousFrom: new Date(start - days * 86400000).toISOString().slice(0, 10), previousTo: new Date(start - 86400000).toISOString().slice(0, 10) },
    sections: {
      overview: { ...sectionMeta(coverage === "complete" ? "partial" : "partial", "Firestore + analyticsDaily", "Traffic metrics require backend product analytics query access."), metrics: [section.overview[0], newUsers, notConfiguredMetric("activeUsers", "Active users", "PostHog"), notConfiguredMetric("pageViews", "Page views", "PostHog"), section.overview[1], section.overview[2], matched, section.overview[3]], traffic: [], activity: [series("drops", "Drops", "pink", "gives"), series("claims", "Claims", "green", "claims")], conversion, topPages: [], topInteractions: [] },
      traffic: { ...sectionMeta("not_configured", "PostHog", "Product behavior data is not connected for this review."), metrics: [notConfiguredMetric("pageViews", "Page views", "PostHog"), notConfiguredMetric("visitors", "Unique visitors", "PostHog"), notConfiguredMetric("sessions", "Sessions", "PostHog")], trend: [], topPages: [], referrers: [], campaigns: [] },
      funnels: { ...sectionMeta("partial", "analyticsDaily + Firestore", "Unavailable stages are not estimated."), drop: funnel("drop", "Drop journey", section.dropFunnel), claim: funnel("claim", "Claim journey", section.claimFunnel) },
      search: { ...sectionMeta("not_configured", "Google Search Console", "Backend Search Console read access is not configured."), reportingPeriod: null, latencyNote: "Search Console does not provide same-day real-time reporting.", metrics: [notConfiguredMetric("clicks", "Clicks", "Google Search Console"), notConfiguredMetric("impressions", "Impressions", "Google Search Console"), { ...notConfiguredMetric("ctr", "CTR", "Google Search Console"), format: "percent" as const }, { ...notConfiguredMetric("position", "Average position", "Google Search Console"), format: "position" as const }], trend: [], queries: [], landingPages: [] },
      performance: { ...sectionMeta("unavailable", "PageSpeed Insights + local build", "Performance reads are provided by the local live review adapter."), field: { ...sectionMeta("not_configured", "Chrome UX Report", "Not enough Chrome field data yet."), devices: [] }, lab: { ...sectionMeta("unavailable", "PageSpeed Insights", "Lab data is unavailable in the emulator endpoint."), devices: [] }, bundles: { ...sectionMeta("unavailable", "Local production build", "Bundle metrics are unavailable in the emulator endpoint."), metrics: [notConfiguredMetric("pageWeight", "Built asset weight", "Local production build"), notConfiguredMetric("javascriptWeight", "JavaScript weight", "Local production build")], assets: [], warning: null } },
      product: { ...sectionMeta(itemsUsable && claimsUsable ? "ready" : "partial", "Firestore"), metrics: [...conversion, ...section.supplyDemand], categories, audiences: [], sizes: [], dropAreas: [], claimAreas: [], wallStatus },
      dataHealth: { ...sectionMeta(coverage === "complete" ? "ready" : "partial", "Firestore + notificationEvents"), metrics: [metric("liveWall", "Live Wall records", items.filter((item) => item.publicVisibility === true).length, "items", "Current visible Wall records"), metric("failedNotifications", "Failed notifications", failedCommunications, "notificationEvents", "Recorded failed notification attempts")], issues: [{ id: "processingImages", label: "Items processing images", count: items.filter((item) => !["complete", "completed", "ready"].includes(String(item.imageProcessingStatus || "").toLowerCase())).length, severity: "warning" as const, href: "/admin/items", message: null }, { id: "missingItem", label: "Claims missing a linked item", count: claims.filter((claim) => claim.itemId && !keptItemIds.has(String(claim.itemId))).length, severity: "critical" as const, href: "/admin/item-requests", message: null }, { id: "failedNotifications", label: "Failed notifications", count: failedCommunications, severity: "critical" as const, href: "/admin/notifications?category=messaging", message: null }], integrations, lastAnalyticsActivityAt: lastAnalytics ? `${lastAnalytics}T23:59:59+05:30` : null, lastNotificationActivityAt: lastNotification },
    },
  };
}

async function readBounded(db: Firestore, name: string, limit: number): Promise<ReadSource> {
  try {
    const snap = await db.collection(name).orderBy(FieldPath.documentId()).limit(limit + 1).get();
    return { rows: snap.docs.slice(0, limit).map((d: any) => ({ ...d.data(), id: d.id })), state: snap.size > limit ? "partial" : "complete", reason: snap.size > limit ? `Source exceeds ${limit} records; dependent metrics are unavailable.` : null };
  } catch (error) {
    return { rows: [], state: "unavailable", reason: error instanceof Error ? error.message : "Read failed" };
  }
}

export async function getAnalyticsSnapshot(db: Firestore, range: "7d" | "30d", now = new Date()) {
  const names = [collections.donorProfiles, collections.donationSubmissions, collections.items, collections.itemRequests, collections.notificationEvents, collections.analyticsDaily];
  const days = range === "7d" ? 7 : 30;
  const firstDay = new Date(now); firstDay.setUTCDate(firstDay.getUTCDate() - (days - 1));
  const values = await Promise.all(names.map(async (name) => {
    if (name !== collections.analyticsDaily) return readBounded(db, name, 1500);
    try {
      const snap = await db.collection(name).orderBy(FieldPath.documentId()).startAt(dayKey(firstDay)).endAt(dayKey(now)).limit(days + 1).get();
      return { rows: snap.docs.slice(0, days).map((d: any) => ({ ...d.data(), id: d.id })), state: snap.size > days ? "partial" as const : "complete" as const, reason: snap.size > days ? "Analytics range contains unexpected duplicate day records." : null };
    } catch (error) { return { rows: [], state: "unavailable" as const, reason: error instanceof Error ? error.message : "Read failed" }; }
  }));
  return buildAnalyticsSnapshot(Object.fromEntries(names.map((name, index) => [name, values[index]])), now, range);
}

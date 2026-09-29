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

export async function getSupportPage(db: Firestore, view: SupportView, limit = 20, cursor?: SupportCursor) {
  const [chats, contacts] = await Promise.all([
    supportWindow(db, "chat", view, cursor?.chatAfter || null, limit),
    supportWindow(db, "contact", view, cursor?.contactAfter || null, limit),
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
    items, nextCursor, order: "Latest Ask Reloved message or contact form submission; exact timestamp and document ID cursor",
  };
}

export function mergeSupportCandidates(chats: ReturnType<typeof supportRow>[], contacts: ReturnType<typeof supportRow>[], limit: number) {
  const items = [...chats, ...contacts].sort((a, b) => String(b.occurredAt || "").localeCompare(String(a.occurredAt || "")) || b.id.localeCompare(a.id)).slice(0, limit);
  const selected = new Set(items.map((row) => row.id));
  return { items, pendingChatIds: chats.filter((row) => !selected.has(row.id)).map((row) => row.sourceId), pendingContactIds: contacts.filter((row) => !selected.has(row.id)).map((row) => row.sourceId) };
}

const inRangeAt = (record: ReadRecord, fields: string[], start: number) => {
  const value = fields.map(field => iso(record[field])).find(Boolean);
  return value ? Date.parse(value) >= start : false;
};
const finished = (r: ReadRecord) => [r.handoverStage, r.opsBookingStatus, r.deliveryStatus, r.status].some((v) => ["delivered", "completed", "reloved"].includes(String(v || "").toLowerCase()));
type Metric = { id: string; label: string; value: number | null; source: string; definition: string; message: string | null };
const unavailable = (id: string, label: string, source: string, definition: string, reason = "Not enough reliable data yet."): Metric => ({ id, label, value: null, source, definition, message: reason });
const metric = (id: string, label: string, value: number, source: string, definition: string): Metric => ({ id, label, value, source, definition, message: null });

export function buildAnalyticsSnapshot(sources: Record<string, ReadSource>, now: Date, range: "7d" | "30d") {
  const days = range === "7d" ? 7 : 30;
  const start = now.getTime() - days * 86400000;
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
      dropsUsable ? metric("drops", "Drops", drops.filter((r) => inRangeAt(r, ["submittedAt"], start)).length, "donationSubmissions + donorProfiles", `Drops whose submittedAt is in the last ${days} days`) : unavailable("drops", "Drops", "donationSubmissions + donorProfiles", "Drops submitted in range after tester exclusion"),
      claimsUsable ? metric("claims", "Claims", claims.filter((r) => inRangeAt(r, ["createdAt", "submittedAt"], start)).length, "itemRequests + items + donorProfiles", `Claims submitted in the last ${days} days`) : unavailable("claims", "Claims", "itemRequests + items + donorProfiles", "Claims in range after tester exclusion"),
      claimsUsable ? metric("reloved", "Reloved", claims.filter(finished).length, "itemRequests + items + donorProfiles", "Current all-time snapshot of claims with recorded delivery completion") : unavailable("reloved", "Reloved", "itemRequests + items + donorProfiles", "Current completed claims after tester exclusion"),
    ],
    acquisition: [unavailable("attribution", "Acquisition attribution", "Unavailable", "Attributed new users by channel")],
    activation: [usable("donorProfiles") ? metric("onboarded", "Profiles completed", users.filter((r) => r.onboardedAt || r.profileComplete === true).length, "donorProfiles", "Current all-time snapshot of profiles with onboarding completion evidence") : unavailable("onboarded", "Profiles completed", "donorProfiles", "Current completed onboarding")],
    dropFunnel: [
      usable("analyticsDaily") ? metric("dropStarted", "Drop started", eventTotal("donation_started"), "analyticsDaily", `Mirrored donation_started events in the last ${days} days`) : unavailable("dropStarted", "Drop started", "analyticsDaily", "Mirrored donation_started event count"),
      dropsUsable ? metric("submitted", "Submitted", drops.filter((r) => inRangeAt(r, ["submittedAt"], start)).length, "donationSubmissions + donorProfiles", `Persisted submissions by submittedAt in the last ${days} days`) : unavailable("submitted", "Submitted", "donationSubmissions + donorProfiles", "Persisted submissions after tester exclusion"),
      itemsUsable ? metric("visible", "Visible on Wall", items.filter((r) => r.publicVisibility === true).length, "items + donorProfiles", "Current all-time snapshot of visible inventory") : unavailable("visible", "Visible on Wall", "items + donorProfiles", "Current visible inventory after tester exclusion"),
    ],
    claimFunnel: [
      usable("analyticsDaily") ? metric("itemViewed", "Item viewed", eventTotal("item_viewed"), "analyticsDaily", `Mirrored item_viewed events in the last ${days} days`) : unavailable("itemViewed", "Item viewed", "analyticsDaily", "Mirrored item_viewed event count"),
      usable("analyticsDaily") ? metric("claimStarted", "Claim started", eventTotal("claim_started"), "analyticsDaily", `Mirrored claim_started events in the last ${days} days`) : unavailable("claimStarted", "Claim started", "analyticsDaily", "Mirrored claim_started event count"),
      claimsUsable ? metric("claimSubmitted", "Claim submitted", claims.filter((r) => inRangeAt(r, ["createdAt", "submittedAt"], start)).length, "itemRequests + items + donorProfiles", `Persisted claims submitted in the last ${days} days`) : unavailable("claimSubmitted", "Claim submitted", "itemRequests + items + donorProfiles", "Persisted claims after tester exclusion"),
      claimsUsable ? metric("matched", "Matched", claims.filter((r) => ["approved", "matched"].includes(String(r.status || "").toLowerCase())).length, "itemRequests + items + donorProfiles", "Current all-time snapshot of accepted or matched claims") : unavailable("matched", "Matched", "itemRequests + items + donorProfiles", "Current matched claims after tester exclusion"),
    ],
    fulfillment: [
      claimsUsable ? metric("delivered", "Delivered / Reloved", claims.filter(finished).length, "itemRequests + items + donorProfiles", "Current all-time snapshot of claims with completion evidence") : unavailable("delivered", "Delivered / Reloved", "itemRequests + items + donorProfiles", "Current completed claims after tester exclusion"),
      usable("notificationEvents") ? metric("failedComms", "Failed communications", events.filter((r) => r.status === "failed" && inRangeAt(r, ["createdAt", "sentAt", "updatedAt"], start)).length, "notificationEvents", `Recorded failed email and SMS attempts in the last ${days} days`) : unavailable("failedComms", "Failed communications", "notificationEvents", "Failed attempts in range"),
    ],
    retention: [unavailable("retention", "Retention", "Unavailable", "Cohort return rate")],
    supplyDemand: itemsUsable && claimsUsable ? [
      metric("availableSupply", "Available supply", items.filter((r) => r.publicVisibility === true && r.publicStatus === "available").length, "items + donorProfiles", "Current all-time snapshot of visible available inventory"),
      metric("claimDemand", "Claim demand", claims.filter((r) => inRangeAt(r, ["createdAt", "submittedAt"], start)).length, "itemRequests + items + donorProfiles", `Claims submitted in the last ${days} days`),
    ] : [unavailable("supplyDemand", "Supply & demand", "items + itemRequests", "Available inventory and claim demand")],
  };
  const all = Object.values(sources);
  const coverage: SourceState = all.some((s) => s.state === "unavailable" || s.state === "partial") ? "partial" : "complete";
  return { asOf: now.toISOString(), range, timezone: "Asia/Kolkata" as const, coverage, sources: Object.entries(sources).map(([source, value]) => ({ source, state: value.state, scanned: value.rows.length, limit: 1501, reason: value.reason })), scope: `Operational Firestore truth and mirrored analytics events for the last ${days} days. Current-state metrics are labelled as such.`, sections: section };
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

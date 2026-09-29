import { FieldPath, type Firestore } from "firebase-admin/firestore";
import { isTesterDoc } from "./analyticsTesters";
import { iso, type ReadRecord } from "./adminControlCenter";
import { collections } from "./firestore";
import { dayKey } from "./analyticsDaily";

export type SourceState = "complete" | "partial" | "unavailable";
export type ReadSource = { rows: ReadRecord[]; state: SourceState; reason: string | null };
export type SupportView = "unread" | "open" | "actioned" | "all";

const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;

export function supportRow(kind: "chat" | "contact", record: ReadRecord) {
  const actioned = String(record.status || "").toLowerCase() === "actioned" || String(record.status || "").toLowerCase() === "resolved";
  const unread = kind === "chat" && record.unreadForAdmin === true;
  return {
    id: `${kind}:${record.id}`,
    sourceId: record.id,
    source: kind === "chat" ? "ask_reloved" as const : "contact_form" as const,
    state: unread ? "unread" as const : actioned ? "actioned" as const : "open" as const,
    person: text(record.ownerName) || text(record.name) || "Visitor",
    email: text(record.ownerEmail) || text(record.participantEmail) || text(record.email),
    phone: text(record.ownerTarget) || text(record.phone),
    subject: text(record.subject) || (kind === "chat" ? "Ask Reloved" : "General inquiry"),
    preview: text(record.lastMessagePreview) || text(record.message) || "No message preview",
    occurredAt: iso(record.lastMessageAt) || iso(record.updatedAt) || iso(record.createdAt),
    linked: {
      itemId: text(record.itemId), dropId: text(record.submissionId), claimId: text(record.claimId),
    },
  };
}

export function supportMatches(row: ReturnType<typeof supportRow>, view: SupportView) {
  return view === "all" || row.state === view || (view === "open" && row.state === "unread");
}

type SupportCursor = { v: 2; view: SupportView; chatAfter: string | null; contactAfter: string | null; pendingChatIds: string[]; pendingContactIds: string[] };
export const encodeSupportCursor = (cursor: SupportCursor) => Buffer.from(JSON.stringify(cursor)).toString("base64url");
export function decodeSupportCursor(value: string, view: SupportView): SupportCursor {
  const parsed = JSON.parse(Buffer.from(value, "base64url").toString()) as Partial<SupportCursor>;
  if (parsed.v !== 2 || parsed.view !== view || !Object.prototype.hasOwnProperty.call(parsed, "chatAfter") || !Object.prototype.hasOwnProperty.call(parsed, "contactAfter") || !Array.isArray(parsed.pendingChatIds) || !Array.isArray(parsed.pendingContactIds)) throw new Error("Invalid cursor");
  const positions = [parsed.chatAfter, parsed.contactAfter, ...parsed.pendingChatIds, ...parsed.pendingContactIds];
  if (parsed.pendingChatIds.length > 40 || parsed.pendingContactIds.length > 40) throw new Error("Invalid cursor");
  for (const position of positions) if (position !== null && (typeof position !== "string" || position.length > 1500 || position.includes("/"))) throw new Error("Invalid cursor");
  return parsed as SupportCursor;
}

async function supportWindow(db: Firestore, collection: string, after: string | null, limit: number): Promise<{ rows: ReadRecord[]; more: boolean }> {
  let query: any = db.collection(collection).orderBy(FieldPath.documentId());
  if (after) query = query.startAfter(after);
  const snap = await query.limit(limit + 1).get();
  return { rows: snap.docs.slice(0, limit).map((d: any) => ({ ...d.data(), id: d.id })), more: snap.size > limit };
}

export async function getSupportPage(db: Firestore, view: SupportView, limit = 20, cursor?: SupportCursor) {
  const windowSize = limit;
  const loadPending = async (collection: string, ids: string[]) => (await Promise.all(ids.map(async id => { const snap = await db.collection(collection).doc(id).get(); return snap.exists ? { ...snap.data(), id: snap.id } as ReadRecord : null; }))).filter((row): row is ReadRecord => !!row);
  const pendingChats = await loadPending(collections.messageThreads, cursor?.pendingChatIds || []);
  const pendingContacts = await loadPending(collections.contactMessages, cursor?.pendingContactIds || []);
  const [chats, contacts] = await Promise.all([
    pendingChats.length ? Promise.resolve({ rows: pendingChats, more: true }) : supportWindow(db, collections.messageThreads, cursor?.chatAfter || null, windowSize),
    pendingContacts.length ? Promise.resolve({ rows: pendingContacts, more: true }) : supportWindow(db, collections.contactMessages, cursor?.contactAfter || null, windowSize),
  ]);
  const chatRows = chats.rows.filter((r) => r.subjectType === "support" && !isTesterDoc(r)).map((r) => supportRow("chat", r));
  const contactRows = contacts.rows.filter((r) => !isTesterDoc(r)).map((r) => supportRow("contact", r));
  const merged = mergeSupportCandidates(chatRows.filter((r) => supportMatches(r, view)), contactRows.filter((r) => supportMatches(r, view)), limit);
  const items = merged.items;
  const chatAfter = pendingChats.length ? cursor?.chatAfter || null : chats.rows.at(-1)?.id || cursor?.chatAfter || null;
  const contactAfter = pendingContacts.length ? cursor?.contactAfter || null : contacts.rows.at(-1)?.id || cursor?.contactAfter || null;
  const nextCursor = chats.more || contacts.more || merged.pendingChatIds.length > 0 || merged.pendingContactIds.length > 0 ? encodeSupportCursor({ v: 2, view, chatAfter, contactAfter, pendingChatIds: merged.pendingChatIds, pendingContactIds: merged.pendingContactIds }) : null;
  return {
    asOf: new Date().toISOString(), coverage: "complete" as const,
    sources: [
      { source: "messageThreads(subjectType=support)", state: "complete" as const, scanned: chats.rows.length, limit: windowSize + 1, reason: null },
      { source: "contactMessages", state: "complete" as const, scanned: contacts.rows.length, limit: windowSize + 1, reason: null },
    ],
    scope: "Ask Reloved support threads and website contact forms. Operational drop and claim chats are excluded.",
    items, nextCursor, order: "Most recent activity within each bounded source window",
  };
}

export function mergeSupportCandidates(chats: ReturnType<typeof supportRow>[], contacts: ReturnType<typeof supportRow>[], limit: number) {
  const items = [...chats, ...contacts].sort((a, b) => String(b.occurredAt || "").localeCompare(String(a.occurredAt || "")) || a.id.localeCompare(b.id)).slice(0, limit);
  const selected = new Set(items.map((row) => row.id));
  return { items, pendingChatIds: chats.filter((row) => !selected.has(row.id)).map((row) => row.sourceId), pendingContactIds: contacts.filter((row) => !selected.has(row.id)).map((row) => row.sourceId) };
}

const inRange = (record: ReadRecord, start: number) => {
  const value = iso(record.createdAt) || iso(record.submittedAt) || iso(record.updatedAt);
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
  const section = {
    overview: [
      usable("donorProfiles") ? metric("users", "Users", users.length, "donorProfiles", "Known non-test profiles") : unavailable("users", "Users", "donorProfiles", "Known non-test profiles", src("donorProfiles").reason || undefined),
      usable("donationSubmissions") ? metric("drops", "Drops", drops.filter((r) => inRange(r, start)).length, "donationSubmissions", `Drops submitted in the last ${days} days`) : unavailable("drops", "Drops", "donationSubmissions", "Drops in range"),
      usable("itemRequests") ? metric("claims", "Claims", claims.filter((r) => inRange(r, start)).length, "itemRequests", `Claims created in the last ${days} days`) : unavailable("claims", "Claims", "itemRequests", "Claims in range", src("itemRequests").reason || undefined),
      usable("itemRequests") ? metric("reloved", "Reloved", claims.filter(finished).length, "itemRequests", "Claims with recorded delivery completion") : unavailable("reloved", "Reloved", "itemRequests", "Completed claims"),
    ],
    acquisition: [unavailable("attribution", "Acquisition attribution", "Unavailable", "Attributed new users by channel")],
    activation: [usable("donorProfiles") ? metric("onboarded", "Profiles completed", users.filter((r) => r.onboardedAt || r.profileComplete === true).length, "donorProfiles", "Profiles with onboarding completion evidence") : unavailable("onboarded", "Profiles completed", "donorProfiles", "Completed onboarding")],
    dropFunnel: [
      usable("analyticsDaily") ? metric("dropStarted", "Drop started", eventTotal("drop_started"), "analyticsDaily", "Mirrored product event count") : unavailable("dropStarted", "Drop started", "analyticsDaily", "Mirrored event count"),
      usable("donationSubmissions") ? metric("submitted", "Submitted", drops.filter((r) => inRange(r, start)).length, "donationSubmissions", "Persisted submissions in range") : unavailable("submitted", "Submitted", "donationSubmissions", "Persisted submissions"),
      usable("items") ? metric("visible", "Visible on Wall", items.filter((r) => r.publicVisibility === true).length, "items", "Current visible inventory") : unavailable("visible", "Visible on Wall", "items", "Current visible inventory"),
    ],
    claimFunnel: [
      usable("analyticsDaily") ? metric("itemViewed", "Item viewed", eventTotal("item_viewed"), "analyticsDaily", "Mirrored product event count") : unavailable("itemViewed", "Item viewed", "analyticsDaily", "Mirrored event count"),
      usable("analyticsDaily") ? metric("claimStarted", "Claim started", eventTotal("claim_started"), "analyticsDaily", "Mirrored product event count") : unavailable("claimStarted", "Claim started", "analyticsDaily", "Mirrored event count"),
      usable("itemRequests") ? metric("claimSubmitted", "Claim submitted", claims.filter((r) => inRange(r, start)).length, "itemRequests", "Persisted claims in range") : unavailable("claimSubmitted", "Claim submitted", "itemRequests", "Persisted claims"),
      usable("itemRequests") ? metric("matched", "Matched", claims.filter((r) => ["approved", "matched"].includes(String(r.status || "").toLowerCase())).length, "itemRequests", "Current accepted or matched claims") : unavailable("matched", "Matched", "itemRequests", "Matched claims"),
    ],
    fulfillment: [
      usable("itemRequests") ? metric("delivered", "Delivered / Reloved", claims.filter(finished).length, "itemRequests", "Claims with completion evidence") : unavailable("delivered", "Delivered / Reloved", "itemRequests", "Completed claims"),
      usable("notificationEvents") ? metric("failedComms", "Failed communications", events.filter((r) => r.status === "failed").length, "notificationEvents", "Recorded failed email and SMS attempts") : unavailable("failedComms", "Failed communications", "notificationEvents", "Failed attempts"),
    ],
    retention: [unavailable("retention", "Retention", "Unavailable", "Cohort return rate")],
    supplyDemand: usable("items") && usable("itemRequests") ? [
      metric("availableSupply", "Available supply", items.filter((r) => r.publicVisibility === true && r.publicStatus === "available").length, "items", "Current visible available inventory"),
      metric("claimDemand", "Claim demand", claims.filter((r) => inRange(r, start)).length, "itemRequests", `Claims in the last ${days} days`),
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

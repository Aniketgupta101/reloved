import { FieldPath, Timestamp, type Firestore } from "firebase-admin/firestore";
import { isTesterDoc } from "./analyticsTesters";
import { iso, type ReadRecord } from "./adminControlCenter";
import { collections } from "./firestore";
import { isRecognisablePublicArea, toPublicArea } from "./geo";

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
const finished = (r: ReadRecord) => [r.handoverStage, r.opsBookingStatus, r.deliveryStatus, r.status].some((v) => ["delivered", "completed", "reloved", "received"].includes(String(v || "").toLowerCase()));
type Metric = { id: string; label: string; value: number | null; state: "ready" | "partial" | "unavailable" | "not_configured" | "insufficient_data"; format: "number" | "percent" | "duration" | "milliseconds" | "score" | "bytes" | "position"; previousValue: number | null; changePercent: number | null; source: string; definition: string; message: string | null };
const unavailable = (id: string, label: string, source: string, definition: string, reason = "Not enough reliable data yet."): Metric => ({ id, label, value: null, state: "insufficient_data", format: "number", previousValue: null, changePercent: null, source, definition, message: reason });
const metric = (id: string, label: string, value: number, source: string, definition: string): Metric => ({ id, label, value, state: "ready", format: "number", previousValue: null, changePercent: null, source, definition, message: null });

const istDay = (date: Date) => new Date(date.getTime() + 19800000).toISOString().slice(0, 10);

export function buildAnalyticsSnapshot(sources: Record<string, ReadSource>, now: Date, range: "7d" | "14d" | "30d") {
  const days = range === "7d" ? 7 : range === "14d" ? 14 : 30;
  const start = Date.parse(`${istDay(now)}T00:00:00+05:30`) - (days - 1) * 86400000;
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
  const testerItemIds = new Set(raw("items").filter(ownedByTester).map(r => r.id));
  const claims = raw("itemRequests").filter((r) => !isTesterDoc(r) && ![r.requesterTarget, r.requesterEmail, r.requesterPhone, r.donorTarget].some(testerIdentity) && !testerItemIds.has(String(r.itemId)));
  const events = raw("notificationEvents").filter((r) => !isTesterDoc(r));
  const mirrorStart = new Date(end - (days - 1) * 86400000).toISOString().slice(0, 10);
  const eventTotal = (name: string) => raw("analyticsDaily").filter(r => r.id >= mirrorStart && r.id <= now.toISOString().slice(0, 10)).reduce((sum, r) => sum + (typeof r[`e_${name}`] === "number" ? Number(r[`e_${name}`]) : 0), 0);
  const dropsUsable = usable("donorProfiles") && usable("donationSubmissions");
  const itemsUsable = usable("donorProfiles") && usable("items");
  const claimsUsable = usable("donorProfiles") && usable("items") && usable("itemRequests");
  const datesComplete = (records: ReadRecord[], fields: string[]) => records.every(r => fields.some(f => iso(r[f])));
  const periodDropsUsable = dropsUsable && datesComplete(drops, ["submittedAt"]);
  const periodClaimsUsable = claimsUsable && datesComplete(claims, ["createdAt", "submittedAt"]);
  const periodUsersUsable = usable("donorProfiles") && datesComplete(users, ["createdAt"]);
  const section = {
    overview: [
      usable("donorProfiles") ? metric("users", "Users", users.length, "donorProfiles", "Current all-time snapshot of known non-test profiles") : unavailable("users", "Users", "donorProfiles", "Current known non-test profiles", src("donorProfiles").reason || undefined),
      periodDropsUsable ? metric("drops", "Drops", drops.filter((r) => inRangeAt(r, ["submittedAt"], start, end)).length, "donationSubmissions + donorProfiles", `Drops whose submittedAt is in the last ${days} days`) : unavailable("drops", "Drops", "donationSubmissions + donorProfiles", "Drops submitted in range after tester exclusion"),
      periodClaimsUsable ? metric("claims", "Claims", claims.filter((r) => inRangeAt(r, ["createdAt", "submittedAt"], start, end)).length, "itemRequests + items + donorProfiles", `Claims submitted in the last ${days} days`) : unavailable("claims", "Claims", "itemRequests + items + donorProfiles", "Claims in range after tester exclusion"),
      claimsUsable ? metric("reloved", "Reloved", claims.filter(finished).length, "itemRequests + items + donorProfiles", "Current all-time snapshot of claims with recorded delivery completion") : unavailable("reloved", "Reloved", "itemRequests + items + donorProfiles", "Current completed claims after tester exclusion"),
    ],
    acquisition: [unavailable("attribution", "Acquisition attribution", "Unavailable", "Attributed new users by channel")],
    activation: [usable("donorProfiles") ? metric("onboarded", "Profiles completed", users.filter((r) => r.onboardedAt || r.profileComplete === true).length, "donorProfiles", "Current all-time snapshot of profiles with onboarding completion evidence") : unavailable("onboarded", "Profiles completed", "donorProfiles", "Current completed onboarding")],
    dropFunnel: [
      usable("analyticsDaily") ? metric("dropStarted", "Drop started", eventTotal("donation_started"), "analyticsDaily", `Mirrored donation_started events in ${days} UTC calendar buckets, through snapshot; testers may be included`) : unavailable("dropStarted", "Drop started", "analyticsDaily", "Mirrored donation_started event count"),
      periodDropsUsable ? metric("submitted", "Submitted", drops.filter((r) => inRangeAt(r, ["submittedAt"], start, end)).length, "donationSubmissions + donorProfiles", `Persisted submissions by submittedAt in the last ${days} days`) : unavailable("submitted", "Submitted", "donationSubmissions + donorProfiles", "Persisted submissions after tester exclusion"),
      itemsUsable ? metric("visible", "Visible on Wall", items.filter((r) => r.publicVisibility === true).length, "items + donorProfiles", "Current all-time snapshot of visible inventory") : unavailable("visible", "Visible on Wall", "items + donorProfiles", "Current visible inventory after tester exclusion"),
    ],
    claimFunnel: [
      usable("analyticsDaily") ? metric("itemViewed", "Item viewed", eventTotal("item_viewed"), "analyticsDaily", `Mirrored item_viewed events in ${days} UTC calendar buckets, through snapshot; testers may be included`) : unavailable("itemViewed", "Item viewed", "analyticsDaily", "Mirrored item_viewed event count"),
      usable("analyticsDaily") ? metric("claimStarted", "Claim started", eventTotal("claim_started"), "analyticsDaily", `Mirrored claim_started events in ${days} UTC calendar buckets, through snapshot; testers may be included`) : unavailable("claimStarted", "Claim started", "analyticsDaily", "Mirrored claim_started event count"),
      periodClaimsUsable ? metric("claimSubmitted", "Claim submitted", claims.filter((r) => inRangeAt(r, ["createdAt", "submittedAt"], start, end)).length, "itemRequests + items + donorProfiles", `Persisted claims submitted in the last ${days} days`) : unavailable("claimSubmitted", "Claim submitted", "itemRequests + items + donorProfiles", "Persisted claims after tester exclusion"),
      claimsUsable ? metric("matched", "Matched", claims.filter((r) => ["approved", "accepted", "matched", "completed"].includes(String(r.status || "").toLowerCase())).length, "itemRequests + items + donorProfiles", "Current all-time snapshot of accepted or matched claims") : unavailable("matched", "Matched", "itemRequests + items + donorProfiles", "Current matched claims after tester exclusion"),
    ],
    fulfillment: [
      claimsUsable ? metric("delivered", "Delivered / Reloved", claims.filter(finished).length, "itemRequests + items + donorProfiles", "Current all-time snapshot of claims with completion evidence") : unavailable("delivered", "Delivered / Reloved", "itemRequests + items + donorProfiles", "Current completed claims after tester exclusion"),
      usable("notificationEvents") ? metric("failedComms", "Failed communications", events.filter((r) => r.status === "failed" && inRangeAt(r, ["createdAt", "sentAt", "updatedAt"], start, end)).length, "notificationEvents", `Recorded failed email and SMS attempts in the last ${days} days`) : unavailable("failedComms", "Failed communications", "notificationEvents", "Failed attempts in range"),
    ],
    retention: [unavailable("retention", "Retention", "Unavailable", "Cohort return rate")],
    supplyDemand: itemsUsable && periodClaimsUsable ? [
      metric("availableSupply", "Available supply", items.filter((r) => r.publicVisibility === true && r.publicStatus === "available").length, "items + donorProfiles", "Current all-time snapshot of visible available inventory"),
      metric("claimDemand", "Claim demand", claims.filter((r) => inRangeAt(r, ["createdAt", "submittedAt"], start, end)).length, "itemRequests + items + donorProfiles", `Claims submitted in the last ${days} days`),
    ] : [unavailable("supplyDemand", "Supply & demand", "items + itemRequests", "Available inventory and claim demand")],
  };
  const required = ["donorProfiles", "donationSubmissions", "items", "itemRequests", "notificationEvents", "analyticsDaily"];
  const all = required.map(src);
  const coverage: SourceState = all.some((s) => s.state === "unavailable" || s.state === "partial") ? "partial" : "complete";
  const sectionMeta = (state: "ready" | "partial" | "unavailable" | "not_configured" | "insufficient_data", source: string, message: string | null = null) => ({ state, source, message });
  const funnel = (id: "drop" | "claim", label: string, metrics: Metric[]) => ({
    id, label, state: metrics.some(entry => entry.value === null) ? "partial" as const : "ready" as const,
    message: "Absolute counts with separate scopes. Not enough reliable data yet for cohort conversion. Mirrored events use UTC days and may include testers.",
    steps: metrics.map(entry => ({ id: entry.id, label: entry.label, value: entry.value, rateFromPrevious: null, state: entry.state, message: `${entry.definition}. Source: ${entry.source}.${entry.message ? ` ${entry.message}` : ""}` })),
  });
  const daily = raw("analyticsDaily").slice().sort((a, b) => a.id.localeCompare(b.id));
  const periodDrops = drops.filter(r => inRangeAt(r, ["submittedAt"], start, end));
  const periodClaims = claims.filter(r => inRangeAt(r, ["createdAt", "submittedAt"], start, end));
  const series = (id: string, label: string, color: "pink" | "green" | "blue", records: ReadRecord[], fields: string[], complete: boolean) => ({
    id, label, color,
    points: Array.from({ length: days }, (_, index) => {
      const from = start + index * 86400000;
      return { at: istDay(new Date(from)), value: complete ? records.filter(r => inRangeAt(r, fields, from, Math.min(end, from + 86400000))).length : null };
    }),
  });
  const row = (id: string, label: string, value: number) => ({ id, label, value, secondaryValue: null, secondaryLabel: null });
  const itemById = new Map(items.map(item => [item.id, item]));
  const comparison = (field: string, fallback: string) => {
    if (!itemsUsable || !periodClaimsUsable) return [];
    const supply = new Map<string, number>(), demand = new Map<string, number>();
    for (const item of items.filter(r => r.publicVisibility === true && r.publicStatus === "available")) {
      const label = text(item[field]) || "Unknown"; supply.set(label, (supply.get(label) || 0) + 1);
    }
    for (const claim of periodClaims) {
      const label = text(itemById.get(String(claim.itemId))?.[field]) || text(claim[fallback]) || "Unknown";
      demand.set(label, (demand.get(label) || 0) + 1);
    }
    return [...new Set([...supply.keys(), ...demand.keys()])].sort().map(label => ({ id: label, label, supply: supply.get(label) || 0, demand: demand.get(label) || 0 }));
  };
  // Reuse the public-area reducer; emit recognised neighbourhoods, never raw address text.
  const areas = (records: ReadRecord[], fields: string[], complete: boolean) => {
    if (!complete) return [];
    const counts = new Map<string, number>();
    records.forEach(record => {
      const candidates = fields.map(f => text(record[f])).filter((value): value is string => value !== null);
      const label = candidates.map(value => toPublicArea(value)).find(value => isRecognisablePublicArea(value)) || (candidates.some(value => /^mumbai$/i.test(value)) ? "Mumbai" : "Unknown");
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, count]) => row(label, label, count));
  };
  const wallStatus = itemsUsable ? ["available", "being_matched", "claimed", "reloved", "other"].map(status => row(status, status.replace(/_/g, " "), items.filter(item => status === "other" ? !["available", "being_matched", "claimed", "reloved"].includes(String(item.publicStatus || "")) : item.publicStatus === status).length)) : [];
  const accepted = (r: ReadRecord) => ["approved", "accepted", "matched", "completed"].includes(String(r.status || "").toLowerCase()) || finished(r);
  const rejected = (r: ReadRecord) => ["rejected", "declined"].includes(String(r.status || "").toLowerCase());
  const acceptedCount = claims.filter(accepted).length;
  const rejectedCount = claims.filter(r => !accepted(r) && rejected(r)).length;
  const decisions = acceptedCount + rejectedCount;
  const checkedMetric = (ok: boolean, id: string, label: string, value: number, source: string, definition: string, reason = "Required source or timestamp coverage is incomplete; this metric is unavailable.") => ok ? metric(id, label, value, source, definition) : unavailable(id, label, source, definition, reason);
  const conversion = [{ ...checkedMetric(claimsUsable && decisions > 0, "claimAcceptance", "Claim acceptance", decisions ? acceptedCount / decisions * 100 : 0, "itemRequests + items + donorProfiles", claimsUsable ? `Current decision snapshot: ${acceptedCount} accepted / ${decisions} accepted or rejected. Pending and withdrawn excluded.` : "Current decision counts are unavailable because dependent source coverage is incomplete. Pending and withdrawn are excluded from decisions.", claimsUsable ? "No accepted or rejected decisions are recorded." : "Dependent sources are incomplete."), format: "percent" as const }];
  const durationMetric = (id: string, label: string, fields: string[], eligible: (r: ReadRecord) => boolean) => {
    const candidates = claims.filter(eligible);
    const values = candidates.flatMap(r => {
      const created = iso(r.createdAt) || iso(r.submittedAt);
      const done = fields.map(f => iso(r[f])).find(Boolean);
      if (!created || !done) return [];
      const hours = (Date.parse(done) - Date.parse(created)) / 3600000;
      return hours >= 0 && Date.parse(done) <= end ? [hours] : [];
    }).sort((a, b) => a - b);
    const mid = Math.floor(values.length / 2);
    const median = values.length ? (values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2) : 0;
    return { ...checkedMetric(claimsUsable && values.length > 0, id, label, median, "itemRequests + items + donorProfiles", `Current lifetime snapshot; explicit ${fields.join(" / ")} minus claim creation, n=${claimsUsable ? values.length : "unavailable"} of ${claimsUsable ? candidates.length : "unavailable"} eligible claims. Missing/invalid timestamps excluded; updatedAt is never inferred.`, claimsUsable ? "No valid timestamp pairs are recorded for this outcome." : "Dependent sources are incomplete."), format: "duration" as const };
  };
  const speed = [durationMetric("medianMatch", "Median time to match", ["acceptedAt", "matchedAt", "reviewedAt"], accepted), durationMetric("medianReloved", "Median time to Reloved", ["receivedAt", "relovedAt", "deliveredAt"], finished)];
  const pipelineKey = (r: ReadRecord) => finished(r) ? "completed" : accepted(r) ? "matched" : rejected(r) ? "rejected" : ["pending", "withdrawn"].includes(String(r.status)) ? String(r.status) : "other";
  const claimPipeline = claimsUsable ? ["pending", "matched", "completed", "rejected", "withdrawn", "other"].map(status => row(status, status, claims.filter(r => pipelineKey(r) === status).length)) : [];
  const aliases = new Map<string, string>();
  users.forEach(r => [r.id, r.target, r.email, r.phone, r.username].map(identity).filter(Boolean).forEach(key => aliases.set(key, r.id)));
  const person = (r: ReadRecord, fields: string[]) => fields.map(f => aliases.get(identity(r[f]))).find(Boolean);
  const giverIds = new Set(drops.map(r => person(r, ["donorId", "donorTarget", "donorEmail", "email", "phone"])).filter(Boolean));
  const claimerIds = new Set(claims.map(r => person(r, ["requesterId", "requesterTarget", "requesterEmail", "requesterPhone"])).filter(Boolean));
  const both = [...giverIds].filter(id => claimerIds.has(id)).length;
  const rolesComplete = dropsUsable && claimsUsable;
  const roles = rolesComplete ? [row("giversOnly", "Giver only", giverIds.size - both), row("claimersOnly", "Claimer only", claimerIds.size - both), row("both", "Both roles", both)] : [];
  const roleCoverage = rolesComplete ? `Current lifetime snapshot of identities joined to profiles. ${drops.filter(r => !person(r, ["donorId", "donorTarget", "donorEmail", "email", "phone"])).length} Drops and ${claims.filter(r => !person(r, ["requesterId", "requesterTarget", "requesterEmail", "requesterPhone"])).length} Claims lack a resolvable profile and are excluded.` : "Role overlap unavailable: dependent sources are incomplete.";
  const availableItems = items.filter(r => r.publicVisibility === true && r.publicStatus === "available");
  const matchingItems = items.filter(r => r.publicStatus === "being_matched");
  const pendingClaims = claims.filter(r => r.status === "pending");
  const ageAtLeast = (r: ReadRecord, days: number) => {
    const created = iso(r.createdAt) || iso(r.submittedAt);
    return created !== null && Date.parse(created) <= end - days * 86400000;
  };
  const aged = availableItems.filter(r => ageAtLeast(r, 7));
  const matching = matchingItems.filter(r => ageAtLeast(r, 3));
  const matchingUsable = itemsUsable && datesComplete(matchingItems, ["createdAt", "submittedAt"]);
  const stuck = pendingClaims.filter(r => ageAtLeast(r, 3));
  const agedUsable = itemsUsable && datesComplete(availableItems, ["createdAt", "submittedAt"]);
  const stuckUsable = claimsUsable && datesComplete(pendingClaims, ["createdAt", "submittedAt"]);
  const attention = [
    { id: "agedAvailable", label: "Available items aged 7+ days", count: agedUsable ? aged.length : null, severity: "warning" as const, href: "/admin/items?availability=available&visibility=visible", message: "Current visible available items, age since recorded creation; not time continuously available." },
    { id: "stuckMatching", label: "Matching Wall items aged 3+ days", count: matchingUsable ? matching.length : null, severity: "warning" as const, href: "/admin/items?availability=being_matched", message: "Current being_matched inventory, including hidden items. Age since recorded creation; not time continuously matching." },
    { id: "pendingClaims", label: "Pending claims aged 3+ days", count: stuckUsable ? stuck.length : null, severity: "warning" as const, href: "/admin/notifications?category=claims", message: "Current pending claims, age since request creation; not inferred from item age." },
  ];
  const attentionItems = [
    ...(agedUsable ? aged.slice(0, 5).map(r => ({ id: `item:${r.id}`, label: text(r.title) || "Available item", href: `/admin/items?itemId=${encodeURIComponent(r.id)}` })) : []),
    ...(matchingUsable ? matching.slice(0, 5).map(r => ({ id: `matching:${r.id}`, label: text(r.title) || "Matching Wall item", href: `/admin/items?itemId=${encodeURIComponent(r.id)}` })) : []),
    ...(stuckUsable ? stuck.slice(0, 5).map(r => ({ id: `claim:${r.id}`, label: "Pending claim", href: `/admin/item-requests?claimId=${encodeURIComponent(r.id)}` })) : []),
  ];
  const failedCommunications = events.filter(event => event.status === "failed").length;
  const newUsers = checkedMetric(periodUsersUsable, "newUsers", "New users", users.filter(r => inRangeAt(r, ["createdAt"], start, end)).length, "donorProfiles", `Profiles created in selected ${days} Asia/Kolkata calendar days, through snapshot time`);
  const matched = checkedMetric(claimsUsable, "matched", "Matched", acceptedCount, "itemRequests + items + donorProfiles", "Current lifetime accepted claims, including completed claims");
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
  const lastAnalytics = daily.map(row => iso(row.updatedAt)).filter((value): value is string => value !== null && Date.parse(value) <= end).sort().at(-1) || null;
  const lastNotification = events.map((event) => iso(event.createdAt || event.sentAt || event.updatedAt)).filter(Boolean).sort().at(-1) || null;
  return {
    asOf: now.toISOString(), range, timezone: "Asia/Kolkata" as const, coverage,
    sources: required.map(source => ({ source, state: src(source).state, scanned: src(source).rows.length, limit: source === "analyticsDaily" ? days : 1500, reason: src(source).reason })),
    scope: `Operational activity: ${days} Asia/Kolkata calendar days through snapshot time (today is partial). Current/lifetime snapshots are separately labelled. Event mirrors use UTC day buckets; no cohort conversions are inferred.`,
    period: { from: istDay(new Date(start)), to: istDay(now), previousFrom: istDay(new Date(start - days * 86400000)), previousTo: istDay(new Date(start - 86400000)) },
    sections: {
      overview: { ...sectionMeta("partial", "Firestore + analyticsDaily", "Traffic metrics require backend product analytics query access."), metrics: [section.overview[0], newUsers, notConfiguredMetric("activeUsers", "Active users", "PostHog"), notConfiguredMetric("pageViews", "Page views", "PostHog"), section.overview[1], section.overview[2], matched, section.overview[3]], traffic: [], activity: [series("drops", "Drops", "pink", drops, ["submittedAt"], periodDropsUsable), series("claims", "Claims", "green", claims, ["createdAt", "submittedAt"], periodClaimsUsable), series("accounts", "Accounts", "blue", users, ["createdAt"], periodUsersUsable)], conversion, topPages: [], topInteractions: [] },
      traffic: { ...sectionMeta("not_configured", "PostHog", "Product behavior data is not connected for this review."), metrics: [notConfiguredMetric("pageViews", "Page views", "PostHog"), notConfiguredMetric("visitors", "Unique visitors", "PostHog"), notConfiguredMetric("sessions", "Sessions", "PostHog")], trend: [], topPages: [], referrers: [], campaigns: [] },
      funnels: { ...sectionMeta("partial", "analyticsDaily + Firestore", "Unavailable stages are not estimated."), activation: [section.overview[0], ...section.activation], drop: funnel("drop", "Drop journey", [...section.dropFunnel, section.overview[3]]), claim: funnel("claim", "Claim journey", [...section.claimFunnel, checkedMetric(claimsUsable, "pending", "Pending", claims.filter(r => r.status === "pending").length, "itemRequests", "Current pending claim snapshot"), section.overview[3]]) },
      search: { ...sectionMeta("not_configured", "Google Search Console", "Backend Search Console read access is not configured."), reportingPeriod: null, latencyNote: "Search Console does not provide same-day real-time reporting.", metrics: [notConfiguredMetric("clicks", "Clicks", "Google Search Console"), notConfiguredMetric("impressions", "Impressions", "Google Search Console"), { ...notConfiguredMetric("ctr", "CTR", "Google Search Console"), format: "percent" as const }, { ...notConfiguredMetric("position", "Average position", "Google Search Console"), format: "position" as const }], trend: [], queries: [], landingPages: [] },
      performance: { ...sectionMeta("unavailable", "PageSpeed Insights + local build", "No verified performance read result is available in this snapshot."), field: { ...sectionMeta("not_configured", "Chrome UX Report", "Not enough Chrome field data yet."), devices: [] }, lab: { ...sectionMeta("unavailable", "PageSpeed Insights", "No verified PageSpeed lab result is available."), devices: [] }, bundles: { ...sectionMeta("unavailable", "Local production build", "No local build result is available in this backend snapshot."), metrics: [notConfiguredMetric("pageWeight", "Built asset weight", "Local production build"), notConfiguredMetric("javascriptWeight", "JavaScript weight", "Local production build")], assets: [], warning: null } },
      product: { ...sectionMeta(itemsUsable && periodClaimsUsable && periodDropsUsable ? "ready" : "partial", "Firestore", "Each period metric requires complete source and timestamp coverage. Current snapshots are labelled separately."), metrics: [...speed, ...conversion, checkedMetric(claimsUsable, "softDeclines", "Soft declines", claims.filter(r => rejected(r) && r.softDecline === true).length, "itemRequests", "Current rejected claims marked softDecline"), checkedMetric(claimsUsable, "withdrawn", "Withdrawn", claims.filter(r => r.status === "withdrawn").length, "itemRequests", "Current withdrawn claim snapshot"), ...section.supplyDemand], categories: comparison("category", "itemCategory"), audiences: comparison("gender", "itemGender"), sizes: comparison("size", "itemSize"), dropAreas: areas(periodDrops, ["publicArea", "locality", "pickupLocality"], periodDropsUsable), claimAreas: areas(periodClaims, ["requesterLocality", "requesterArea", "requesterAddress", "address"], periodClaimsUsable), wallStatus, claimPipeline, roles, roleCoverage, attention, attentionItems },
      dataHealth: { ...sectionMeta(coverage === "complete" ? "ready" : "partial", "Firestore + notificationEvents"), metrics: [checkedMetric(itemsUsable, "liveWall", "Live Wall records", items.filter((item) => item.publicVisibility === true).length, "items", "Current visible Wall records"), checkedMetric(usable("notificationEvents"), "failedNotifications", "Failed notifications", failedCommunications, "notificationEvents", "Recorded failed notification attempts")], issues: [{ id: "processingImages", label: "Items processing images", count: itemsUsable ? items.filter((item) => ["pending", "processing", "failed"].includes(String(item.imageProcessingStatus || "").toLowerCase())).length : null, severity: "warning" as const, href: "/admin/items", message: null }, { id: "missingItem", label: "Claims missing a linked item", count: claimsUsable ? claims.filter((claim) => !claim.itemId || !keptItemIds.has(String(claim.itemId))).length : null, severity: "critical" as const, href: "/admin/item-requests", message: null }, { id: "failedNotifications", label: "Failed notifications", count: usable("notificationEvents") ? failedCommunications : null, severity: "critical" as const, href: "/admin/notifications?category=messaging", message: null }], integrations, lastAnalyticsActivityAt: usable("analyticsDaily") && lastAnalytics ? lastAnalytics : null, lastNotificationActivityAt: usable("notificationEvents") ? lastNotification : null },
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

export async function getAnalyticsSnapshot(db: Firestore, range: "7d" | "14d" | "30d", now = new Date()) {
  const names = [collections.donorProfiles, collections.donationSubmissions, collections.items, collections.itemRequests, collections.notificationEvents, collections.analyticsDaily];
  const days = range === "7d" ? 7 : range === "14d" ? 14 : 30;
  const firstDay = new Date(now); firstDay.setUTCDate(firstDay.getUTCDate() - (days - 1));
  const values = await Promise.all(names.map(async (name) => {
    if (name !== collections.analyticsDaily) return readBounded(db, name, 1500);
    try {
      const snap = await db.collection(name).orderBy(FieldPath.documentId()).startAt(firstDay.toISOString().slice(0, 10)).endAt(now.toISOString().slice(0, 10)).limit(days + 1).get();
      return { rows: snap.docs.slice(0, days).map((d: any) => ({ ...d.data(), id: d.id })), state: snap.size > days ? "partial" as const : "complete" as const, reason: snap.size > days ? "Analytics range contains unexpected duplicate day records." : null };
    } catch (error) { return { rows: [], state: "unavailable" as const, reason: error instanceof Error ? error.message : "Read failed" }; }
  }));
  return buildAnalyticsSnapshot(Object.fromEntries(names.map((name, index) => [name, values[index]])), now, range);
}

import {
  FieldPath,
  type Firestore,
  type Query,
} from "firebase-admin/firestore";
import { z } from "zod";
import type {
  OperationRow,
  OperationAction,
  OperationDetail,
  CommunicationRow,
  Page,
  ReadMetadata,
  DropFunnel,
} from "../../../../shared/adminControlCenter";
import {
  iso,
  timeWindows,
  inWindow,
  notificationAudit,
  getOverview,
  type ReadRecord,
} from "./adminControlCenter";
import { isTesterDoc } from "./analyticsTesters";
import { findDonorProfileDoc } from "./donorIdentity";

const text = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim() : null;
const idSchema = z
  .string()
  .min(1)
  .max(1500)
  .refine((v) => !v.includes("/"));
const daySchema = z
  .string()
  .refine(
    (v) =>
      /^\d{4}-\d{2}-\d{2}$/.test(v) &&
      Number.isFinite(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
  );
export const operationsQuery = z
  .object({
    status: z
      .enum(["all", "pending", "approved", "rejected", "cancelled"])
      .default("all"),
    view: z
      .enum([
        "all",
        "today",
        "next48h",
        "completed",
        "unscheduled",
        "overdue",
        "calendar",
      ])
      .default("all"),
    day: daySchema.optional(),
    span: z.enum(["day", "week"]).default("day"),
    limit: z.coerce.number().int().min(1).max(20).default(10),
    cursor: z.string().max(8000).optional(),
  })
  .strict();
type Input = z.input<typeof operationsQuery>;
type Kind = "claims" | "deliveries";
const signature = (input: Input) => {
  const { cursor: _, ...q } = operationsQuery.parse(input);
  return JSON.stringify(q);
};
const cursorSchema = z
  .object({
    v: z.literal(1),
    kind: z.enum(["claims", "deliveries", "communications"]),
    filter: z.string(),
    after: idSchema,
    asOf: z.string().datetime(),
  })
  .strict();
const encode = (v: z.infer<typeof cursorSchema>) =>
  Buffer.from(JSON.stringify(v)).toString("base64url");
export function decodeOperationsCursor(raw: string, kind: Kind, input: Input) {
  const c = cursorSchema.parse(
    JSON.parse(Buffer.from(raw, "base64url").toString()),
  );
  if (c.kind !== kind || c.filter !== signature(input))
    throw new Error("Cursor does not match view");
  return c;
}
export function decodeCommunicationCursor(raw: string, id: string) {
  const c = cursorSchema.parse(
    JSON.parse(Buffer.from(raw, "base64url").toString()),
  );
  if (c.kind !== "communications" || c.filter !== id)
    throw new Error("Cursor does not match claim");
  return c;
}
const completed = (c: ReadRecord) =>
  c.opsBookingStatus === "delivered" ||
  c.deliveryStatus === "delivered" ||
  ["received", "delivered"].includes(String(c.handoverStage));
export function operationTiming(
  c: ReadRecord,
  now: Date,
): OperationRow["timing"] {
  if (completed(c)) return "completed";
  const agreed = iso(c.agreedSlotAt);
  return agreed
    ? Date.parse(agreed) < now.getTime()
      ? "overdue"
      : "scheduled"
    : iso(c.proposedSlotAt)
      ? "proposed"
      : "unscheduled";
}
export function operationMatches(
  c: ReadRecord,
  kind: Kind,
  q: z.output<typeof operationsQuery>,
  now: Date,
) {
  if (q.status !== "all" && c.status !== q.status) return false;
  if (kind === "claims") return true;
  if (c.status !== "approved") return false;
  const timing = operationTiming(c, now);
  if (q.view === "all") return true;
  if (q.view === "completed") return completed(c);
  if (completed(c)) return false;
  if (q.view === "unscheduled")
    return !iso(c.agreedSlotAt) && !iso(c.proposedSlotAt);
  if (q.view === "overdue") return timing === "overdue";
  const w = timeWindows(now);
  const slot = iso(c.agreedSlotAt) || iso(c.proposedSlotAt);
  if (q.view === "today") return inWindow(slot, w.todayStart, w.todayEnd);
  if (q.view === "next48h") return inWindow(slot, w.next48Start, w.next48End);
  const day =
    q.day || new Date(now.getTime() + 19800000).toISOString().slice(0, 10);
  const start = new Date(day + "T00:00:00+05:30");
  return inWindow(
    slot,
    start.toISOString(),
    new Date(
      start.getTime() + (q.span === "week" ? 7 : 1) * 86400000,
    ).toISOString(),
  );
}
export function operationAction(c: ReadRecord, _now: Date): OperationAction {
  if (c.status === "pending") return { kind: "review", label: "Review claim" };
  if (c.status !== "approved")
    return { kind: "closed", label: "View closed claim" };
  if (completed(c))
    return { kind: "complete", label: "View completed handover" };
  // Existing order mutation models the manual courier lifecycle only. Do not invent courier bookings.
  if (
    c.giverLogistics === "porter_arranged" &&
    !c.borzoOrderId &&
    !c.shiprocketOrderId &&
    !c.shadowfaxOrderId
  ) {
    if (c.opsBookingStatus === "out_for_delivery")
      return {
        kind: "stage",
        label: "Confirm delivered",
        opsStatus: "delivered",
      };
    if (c.opsBookingStatus === "booked")
      return {
        kind: "stage",
        label: "Mark out for delivery",
        opsStatus: "out_for_delivery",
      };
    if (
      (c.opsBookingStatus === "ready_to_book" ||
        c.handoverStage === "schedule_agreed") &&
      iso(c.agreedSlotAt) &&
      c.pickupAddressConfirmedByGiver === true &&
      c.dropAddressConfirmedByClaimer === true
    )
      return {
        kind: "stage",
        label: "Confirm courier arranged offline",
        opsStatus: "booked",
      };
  }
  return {
    kind: "coordinate",
    label: !iso(c.agreedSlotAt) ? "Coordinate schedule" : "Coordinate handover",
  };
}
const scope =
  "Live document-ID scan; continue empty pages to reach all matches. India calendar windows use agreed slots, or explicitly proposed slots when agreement is absent. Undated records remain under All / Unscheduled. Known testers excluded using linked claim, item, submission and bounded giver-profile lookup. Missing identity stays visibly unrecorded; tester classification is incomplete without identity links. Each matching row reads at most one item, one submission, 92 profile candidates and 21 notification attempts. The channel summary is incomplete above 20 attempts; open the paged audit for all recorded attempts. No full-collection browser joins. Recorded communication attempts do not prove receipt; unlogged messages are unavailable.";
const meta = (
  asOf: string,
  source: string,
  scanned: number,
  limit: number,
  more: boolean,
): ReadMetadata => ({
  asOf,
  coverage: "partial",
  scope,
  sources: [
    {
      source,
      state: more ? "partial" : "complete",
      scanned,
      limit,
      reason: more ? "Continue to the next scan." : null,
    },
    {
      source: "communication-coverage",
      state: "partial",
      scanned: 0,
      limit: 0,
      reason: "Delivery attempts only; not a complete message history.",
    },
  ],
});
async function doc(
  db: Firestore,
  name: string,
  id: unknown,
): Promise<ReadRecord | null> {
  if (!text(id) || !idSchema.safeParse(id).success) return null;
  const d = await db.collection(name).doc(String(id)).get();
  return d.exists ? { ...d.data(), id: d.id } : null;
}
async function ownerProfile(db: Firestore, source: ReadRecord | null) {
  const target =
    text(source?.donorTarget) ||
    text(source?.email) ||
    text(source?.donorEmail) ||
    text(source?.phone) ||
    text(source?.donorPhone);
  if (!target) return null;
  const p = await findDonorProfileDoc(
    db,
    target,
    text(source?.phone) || text(source?.donorPhone),
  );
  return p ? ({ ...p.data(), id: p.id } as ReadRecord) : null;
}
const point = (lat: unknown, lng: unknown) =>
  typeof lat === "number" &&
  typeof lng === "number" &&
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  Math.abs(lat) <= 90 &&
  Math.abs(lng) <= 180 &&
  !(lat === 0 && lng === 0)
    ? { latitude: lat, longitude: lng }
    : null;
async function row(
  db: Firestore,
  c: ReadRecord,
  now: Date,
): Promise<OperationRow | null> {
  const item = await doc(db, "items", c.itemId);
  const submission = await doc(db, "donationSubmissions", item?.submissionId);
  const profile = await ownerProfile(db, submission || item);
  if ([c, item, submission, profile].some(isTesterDoc)) return null;
  const events = await db
    .collection("notificationEvents")
    .where("claimId", "==", c.id)
    .orderBy(FieldPath.documentId())
    .limit(21)
    .get();
  const source = submission || item;
  const pickup = point(
    c.pickupLatitude ?? source?.latitude,
    c.pickupLongitude ?? source?.longitude,
  );
  const destination = point(c.requesterLatitude, c.requesterLongitude);
  const action = operationAction(c, now);
  return {
    id: c.id,
    itemId: text(c.itemId),
    itemTitle: text(item?.title) || text(c.itemTitle),
    itemImages: Array.isArray(item?.images)
      ? item.images
      : Array.isArray(c.itemImages)
        ? c.itemImages
        : [],
    giverName:
      [source?.donorFirstName, source?.donorLastName]
        .filter(Boolean)
        .join(" ") ||
      text(source?.donorRecognition) ||
      text(profile?.displayName) ||
      [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") ||
      null,
    giverEmail:
      text(source?.email) || text(source?.donorEmail) || text(profile?.email),
    giverPhone:
      text(source?.phone) || text(source?.donorPhone) || text(profile?.phone),
    requesterName: text(c.requesterName),
    requesterEmail:
      text(c.requesterEmail) ||
      (String(c.requesterTarget || "").includes("@")
        ? text(c.requesterTarget)
        : null),
    requesterPhone: text(c.requesterPhone),
    pickupLocality: text(c.pickupLocality) || text(source?.pickupLocality),
    pickupAddress:
      text(c.pickupAddress) ||
      text(c.pickupLocality) ||
      text(source?.pickupAddress) ||
      text(source?.pickupLocality),
    requesterAddress: text(c.requesterAddress),
    logistics: text(c.giverLogistics) || text(c.deliveryMethod),
    status:
      text(c.deliveryStatus) ||
      text(c.opsBookingStatus) ||
      text(c.handoverStage),
    claimStatus: text(c.status),
    handoverStage: text(c.handoverStage),
    opsBookingStatus: text(c.opsBookingStatus),
    deliveryStatus: text(c.deliveryStatus),
    note: text(c.note),
    opsNote: text(c.opsNote),
    createdAt: iso(c.createdAt),
    updatedAt: iso(c.updatedAt),
    agreedSlotAt: iso(c.agreedSlotAt),
    proposedSlotAt: iso(c.proposedSlotAt),
    timing: operationTiming(c, now),
    action,
    nextAction: {
      label: action.label,
      href: `/admin/${c.status === "pending" ? "item-requests" : "orders"}?claimId=${encodeURIComponent(c.id)}`,
    },
    notifications: notificationAudit(
      events.docs.slice(0, 20).map((d) => ({ ...d.data(), id: d.id })),
      events.size > 20 ? "partial" : "complete",
    ),
    map: {
      state: pickup && destination ? "available" : "unavailable",
      reason:
        pickup && destination
          ? "Recorded coordinates only; not navigation or a verified route."
          : "Complete, valid pickup and destination coordinates are not recorded. Address text is not geocoded.",
      pickup,
      destination,
    },
  };
}
export async function getOperationsPage(
  db: Firestore,
  kind: Kind,
  input: Input,
  now = new Date(),
): Promise<Page<OperationRow>> {
  const q = operationsQuery.parse(input);
  const cursor = q.cursor ? decodeOperationsCursor(q.cursor, kind, q) : null;
  const asOf = cursor?.asOf || now.toISOString();
  const anchor = new Date(asOf);
  let query: Query = db
    .collection("itemRequests")
    .orderBy(FieldPath.documentId());
  if (cursor) query = query.startAfter(cursor.after);
  const snap = await query.limit(q.limit + 1).get();
  const records = snap.docs.slice(0, q.limit);
  const more = snap.size > q.limit;
  const matched = records
    .map((d) => ({ ...d.data(), id: d.id }))
    .filter((c) => operationMatches(c, kind, q, anchor));
  const items = (
    await Promise.all(matched.map((c) => row(db, c, anchor)))
  ).filter((r): r is OperationRow => !!r);
  return {
    ...meta(asOf, "itemRequests", snap.size, q.limit + 1, more),
    items,
    nextCursor: more
      ? encode({
          v: 1,
          kind,
          filter: signature(q),
          after: records[records.length - 1].id,
          asOf,
        })
      : null,
    order:
      "Document ID ascending. Window anchored at first scan; live edits can change membership. Continue empty filtered scans.",
  };
}
export async function getOperationDetail(
  db: Firestore,
  id: string,
  now = new Date(),
): Promise<OperationDetail | null> {
  const c = await doc(db, "itemRequests", id);
  if (!c) return null;
  const result = await row(db, c, now);
  return result
    ? {
        ...meta(now.toISOString(), "itemRequests/" + id, 1, 1, false),
        ...result,
      }
    : null;
}
export async function getCommunications(
  db: Firestore,
  id: string,
  raw?: string,
): Promise<Page<CommunicationRow>> {
  const c = await doc(db, "itemRequests", id);
  if (!c || isTesterDoc(c)) throw new Error("Claim unavailable");
  const item = await doc(db, "items", c.itemId);
  const submission = await doc(db, "donationSubmissions", item?.submissionId);
  const profile = await ownerProfile(db, submission || item);
  if ([item, submission, profile].some(isTesterDoc))
    throw new Error("Claim unavailable");
  const cursor = raw ? decodeCommunicationCursor(raw, id) : null;
  let query: Query = db
    .collection("notificationEvents")
    .where("claimId", "==", id)
    .orderBy(FieldPath.documentId());
  if (cursor) query = query.startAfter(cursor.after);
  const snap = await query.limit(21).get();
  const docs = snap.docs.slice(0, 20);
  const asOf = cursor?.asOf || new Date().toISOString();
  const items: CommunicationRow[] = docs.flatMap((d) => {
    const e = d.data();
    if (!["sent", "failed", "skipped"].includes(e.status)) return [];
    return [
      {
        id: d.id,
        status: e.status,
        at: iso(e.createdAt),
        templateKey: text(e.templateKey),
        audience: text(e.audience),
        destination: text(e.to),
        error: text(e.error),
        channel: text(e.channel) || "unknown",
        subject: text(e.subject),
        previewBody: text(e.previewBody),
        params: Object.fromEntries(
          Object.entries(e.params || {}).filter(
            (p): p is [string, string] => typeof p[1] === "string",
          ),
        ),
      },
    ];
  });
  return {
    ...meta(
      asOf,
      "notificationEvents/claimId/" + id,
      snap.size,
      21,
      snap.size > 20,
    ),
    items,
    nextCursor:
      snap.size > 20
        ? encode({
            v: 1,
            kind: "communications",
            filter: id,
            after: docs[docs.length - 1].id,
            asOf,
          })
        : null,
    order:
      "Document ID ascending, including undated attempts; timestamps shown when recorded.",
  };
}
export async function getClaimFunnel(db: Firestore): Promise<DropFunnel> {
  const o = await getOverview(db, "7d");
  const k = o.kpis.find((k) => k.id === "claims");
  return {
    ...o,
    coverage: "partial",
    scope:
      "Rolling seven-day claim creations; other stages lack a linked historical cohort. No conversion percentages.",
    steps: [
      {
        id: "started",
        label: "Claim started",
        value: null,
        source: "analyticsDaily",
        reason:
          "Aggregate events cannot identify unique claims or historical tester activity.",
      },
      {
        id: "submitted",
        label: "Claims created · 7 days",
        value: k?.value ?? null,
        source: "itemRequests",
        reason: k?.reason ?? null,
      },
      ...["Matched", "Scheduled", "Completed"].map((label) => ({
        id: label.toLowerCase(),
        label,
        value: null,
        source: "itemRequests",
        reason:
          "Current status is not a historical cohort transition. Browse the operational views for recorded states.",
      })),
    ],
  };
}

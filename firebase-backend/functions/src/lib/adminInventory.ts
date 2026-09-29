import {
  FieldPath,
  Timestamp,
  type Firestore,
  type Query,
} from "firebase-admin/firestore";
import { z } from "zod";
import type {
  DropAdminRow,
  WallAdminItem,
  InventoryPerson,
  Page,
  ReadMetadata,
  SourceCoverage,
  InventoryDetail,
  DropFunnel,
  InventoryClaim,
  InventoryClaimFocus,
} from "../../../../shared/adminControlCenter";
import {
  getOverview,
  iso,
  notificationAudit,
  type ReadRecord,
} from "./adminControlCenter";
import { isTesterDoc } from "./analyticsTesters";
import { findDonorProfileDoc } from "./donorIdentity";

const dateInput = z
  .string()
  .refine(
    (v) =>
      !v ||
      (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
        Number.isFinite(Date.parse(v)) &&
        new Date(v).toISOString().slice(0, 10) === v),
    "Invalid calendar date",
  )
  .default("");
export const inventoryQuery = z
  .object({
    lane: z.enum(["all", "recent"]).default("all"),
    dateFrom: dateInput,
    dateTo: dateInput,
    status: z
      .enum([
        "all",
        "submitted",
        "under_review",
        "approved",
        "rejected",
        "withdrawn",
      ])
      .default("all"),
    visibility: z.enum(["all", "visible", "hidden"]).default("all"),
    availability: z
      .enum([
        "all",
        "available",
        "being_matched",
        "claimed",
        "reloved",
        "withdrawn",
      ])
      .default("all"),
    category: z.string().trim().max(80).default(""),
    gender: z.string().trim().max(30).default(""),
    size: z.string().trim().max(40).default(""),
    search: z.string().trim().max(100).default(""),
    limit: z.coerce.number().int().min(1).max(20).default(10),
    cursor: z.string().max(24000).optional(),
  })
  .strict()
  .refine(
    (q) => !q.dateFrom || !q.dateTo || q.dateFrom <= q.dateTo,
    "Invalid date range",
  );
type InventoryQuery = z.input<typeof inventoryQuery>;
type Kind = "drops" | "wall";
const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const scope =
  "Live reads, not a transactional snapshot. All records uses ID scans and retains legacy/undated inventory. Recent/date lanes order canonical creation timestamps only. Linked filters continue through bounded item and claim windows before advancing the parent; continue through empty pages. Known tester owners are excluded where identity is available. Page lengths are not global totals.";
function signature(input: InventoryQuery) {
  const { cursor: _cursor, ...filters } = inventoryQuery.parse(input);
  return JSON.stringify(filters);
}
const safeId = z
  .string()
  .max(1500)
  .refine((s) => !s.includes("/"));
// Cursor positions must preserve Firestore's nanoseconds; ISO dates are display-only.
const timestampPositionSchema = z
  .object({
    seconds: z.number().int().min(-62135596800).max(253402300799),
    nanoseconds: z.number().int().min(0).max(999999999),
  })
  .strict();
function timestampPosition(value: unknown) {
  return value instanceof Timestamp
    ? { seconds: value.seconds, nanoseconds: value.nanoseconds }
    : null;
}
const pendingSchema = z
  .object({
    id: safeId.refine((s) => s.length > 0),
    at: timestampPositionSchema.nullable(),
    morePrimary: z.boolean(),
    itemAfter: safeId.optional(),
    itemId: safeId.optional(),
    moreItems: z.boolean().optional(),
    claimAfter: safeId.optional(),
  })
  .strict();
const cursorSchema = z
  .object({
    v: z.literal(3),
    kind: z.enum(["drops", "wall"]),
    filter: z.string(),
    after: safeId,
    afterAt: timestampPositionSchema.nullable(),
    asOf: z.string().datetime(),
    pending: pendingSchema.optional(),
  })
  .strict();
type InventoryCursor = z.infer<typeof cursorSchema>;
export function decodeInventoryCursor(
  cursor: string,
  kind: Kind,
  input: InventoryQuery,
) {
  const value = cursorSchema.parse(
    JSON.parse(Buffer.from(cursor, "base64url").toString()),
  );
  if (value.kind !== kind || value.filter !== signature(input))
    throw new Error("Cursor does not match filters");
  const q = inventoryQuery.parse(input);
  if (
    dated(q) &&
    ((value.after && !value.afterAt) || (value.pending && !value.pending.at))
  )
    throw new Error("Dated cursor requires timestamp position");
  return value;
}
const encodeCursor = (value: InventoryCursor) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const linkedCursor = (kind: "items" | "claims", id: string, after: string) =>
  Buffer.from(JSON.stringify({ kind, id, after })).toString("base64url");
export function decodeLinkedCursor(
  value: string,
  kind: "items" | "claims",
  id: string,
) {
  const cursor = z
    .object({
      kind: z.enum(["items", "claims"]),
      id: safeId.refine((s) => s.length > 0),
      after: safeId.refine((s) => s.length > 0),
    })
    .strict()
    .parse(JSON.parse(Buffer.from(value, "base64url").toString()));
  if (cursor.kind !== kind || cursor.id !== id)
    throw new Error("Linked cursor does not match entity");
  return cursor.after;
}
const claimRow = (c: ReadRecord): InventoryClaim => ({
  id: c.id,
  requesterName: text(c.requesterName),
  status: text(c.status),
  handoverStage: text(c.handoverStage) || text(c.opsBookingStatus),
  agreedSlotAt: iso(c.agreedSlotAt),
  createdAt: iso(c.createdAt),
});
function metadata(
  sources: SourceCoverage[],
  asOf = new Date().toISOString(),
): ReadMetadata {
  const merged = new Map<string, SourceCoverage>();
  for (const source of sources) {
    const previous = merged.get(source.source);
    if (!previous) {
      merged.set(source.source, { ...source });
      continue;
    }
    previous.scanned += source.scanned;
    previous.limit += source.limit;
    if (source.state !== previous.state) previous.state = "partial";
    if (source.reason && source.reason !== previous.reason)
      previous.reason = [previous.reason, source.reason]
        .filter(Boolean)
        .join(" ");
  }
  return {
    asOf,
    sources: [...merged.values()],
    coverage: sources.every((s) => s.state === "complete")
      ? "complete"
      : "partial",
    scope,
  };
}
/** Per-request cache bounds duplicate linked reads when a drop has several items. */
class InventoryReader {
  sources: SourceCoverage[] = [];
  private docs = new Map<string, Promise<ReadRecord | null>>();
  private profiles = new Map<string, Promise<ReadRecord | null>>();
  constructor(
    private db: Firestore,
    private detail = false,
  ) {}
  async query(
    name: string,
    field: string,
    id: string,
    limit: number,
  ): Promise<ReadRecord[]> {
    const snap = await this.db
      .collection(name)
      .where(field, "==", id)
      .orderBy(FieldPath.documentId())
      .limit(limit + 1)
      .get();
    const more = snap.size > limit;
    this.sources.push({
      source: `${name}/${field}/${id}`,
      state: more ? "partial" : "complete",
      scanned: snap.size,
      limit: limit + 1,
      reason: more
        ? `Linked records exceed ${limit}; detail is incomplete.`
        : null,
    });
    return snap.docs.slice(0, limit).map((d) => ({ ...d.data(), id: d.id }));
  }
  doc(name: string, id: string) {
    const key = `${name}/${id}`;
    if (!this.docs.has(key))
      this.docs.set(
        key,
        this.db
          .collection(name)
          .doc(id)
          .get()
          .then((d) => {
            this.sources.push({
              source: key,
              state: d.exists ? "complete" : "unavailable",
              scanned: d.exists ? 1 : 0,
              limit: 1,
              reason: d.exists ? null : "Linked record not found.",
            });
            return d.exists ? { ...d.data(), id: d.id } : null;
          }),
      );
    return this.docs.get(key)!;
  }
  async owner(
    record: ReadRecord,
    submission: ReadRecord | null,
  ): Promise<{ person: InventoryPerson; tester: boolean }> {
    const source = { ...record, ...submission };
    const target =
      text(source.donorTarget) ||
      text(source.donorEmail) ||
      text(source.email) ||
      text(source.donorPhone) ||
      text(source.phone);
    let profile: ReadRecord | null = null;
    if (target) {
      if (!this.profiles.has(target))
        this.profiles.set(
          target,
          findDonorProfileDoc(
            this.db,
            target,
            text(source.phone) || text(source.donorPhone),
          ).then((d) => {
            // Existing identity resolver caps every query (at most 92 returned docs across all fallbacks).
            this.sources.push({
              source: `donorProfiles/${target}`,
              state: d ? "complete" : "unavailable",
              scanned: d ? 1 : 0,
              limit: 92,
              reason: d
                ? "Existing bounded identity resolver; scanned count reports the resolved profile, not all lookup candidates."
                : "Owner profile unavailable; identity fields and tester exclusion rely on the source record.",
            });
            return d ? { ...d.data(), id: d.id } : null;
          }),
        );
      profile = await this.profiles.get(target)!;
    } else
      this.sources.push({
        source: `owner/${record.id}`,
        state: "unavailable",
        scanned: 0,
        limit: 0,
        reason:
          "No owner identity link; tester eligibility and profile enrichment are incomplete.",
      });
    const name = [source.donorFirstName, source.donorLastName]
      .filter(Boolean)
      .join(" ");
    return {
      tester:
        isTesterDoc(record) || isTesterDoc(submission) || isTesterDoc(profile),
      person: {
        name:
          text(name) ||
          text(source.donorRecognition) ||
          text(profile?.displayName) ||
          [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") ||
          null,
        username: text(profile?.username),
        email:
          text(source.donorEmail) ||
          text(source.email) ||
          text(profile?.email) ||
          (target?.includes("@") ? target : null),
        phone:
          text(source.phone) || text(source.donorPhone) || text(profile?.phone),
        locality:
          text(source.locality) ||
          text(source.pickupLocality) ||
          text(profile?.locality),
      },
    };
  }
  async wall(
    record: ReadRecord,
    givenSubmission?: ReadRecord | null,
  ): Promise<WallAdminItem | null> {
    const submissionId = text(record.submissionId);
    const submission =
      givenSubmission === undefined && submissionId
        ? await this.doc("donationSubmissions", submissionId)
        : givenSubmission || null;
    const owner = await this.owner(record, submission);
    if (owner.tester) return null;
    const rawClaims = await this.query(
      "itemRequests",
      "itemId",
      record.id,
      this.detail ? 20 : 5,
    );
    const claims = rawClaims.filter((c) => !isTesterDoc(c));
    const claimSource = this.sources.find(
      (s) => s.source === `itemRequests/itemId/${record.id}`,
    )!;
    const eventSnapshot = claims.length
      ? await this.db
          .collection("notificationEvents")
          .where(
            "claimId",
            "in",
            claims.map((c) => c.id),
          )
          .limit(21)
          .get()
      : null;
    const events =
      eventSnapshot?.docs
        .slice(0, 20)
        .map((d) => ({ ...d.data(), id: d.id })) || [];
    const eventsComplete = !eventSnapshot || eventSnapshot.size <= 20;
    this.sources.push({
      source: `notificationEvents/item/${record.id}`,
      state: eventsComplete ? "complete" : "partial",
      scanned: eventSnapshot?.size || 0,
      limit: 21,
      reason: eventsComplete
        ? null
        : "More than 20 linked notification attempts; latest attempt and counts are unavailable.",
    });
    const complete = claimSource.state === "complete" && eventsComplete;
    this.sources.push({
      source: `communication-coverage/${record.id}`,
      state: "partial",
      scanned: 0,
      limit: 0,
      reason:
        "Audit covers recorded claim delivery attempts only. Drop receipts and other unlogged messages are unavailable; sent does not mean received.",
    });
    return {
      id: record.id,
      submissionId,
      title: text(record.title) || "Untitled item",
      description: text(record.description),
      category: text(record.category),
      gender: text(record.gender),
      size: text(record.size),
      condition: text(record.condition),
      locality:
        text(record.locality) ||
        text(record.publicArea) ||
        owner.person.locality,
      status: text(record.status),
      publicStatus: text(record.publicStatus),
      publicVisibility:
        typeof record.publicVisibility === "boolean"
          ? record.publicVisibility
          : null,
      images: Array.isArray(record.images)
        ? record.images.flatMap((i) =>
            typeof i === "object" && i && text(i.storagePath)
              ? [{ storagePath: String(i.storagePath) }]
              : [],
          )
        : [],
      createdAt: iso(record.createdAt),
      updatedAt: iso(record.updatedAt),
      dropper: owner.person,
      processing:
        text(record.imageProcessingStatus) ||
        text(record.processingStatus) ||
        (record.publicStatus === "processing_image"
          ? "Processing photos"
          : null),
      claimsNextCursor:
        claimSource.state === "partial"
          ? linkedCursor(
              "claims",
              record.id,
              rawClaims[rawClaims.length - 1].id,
            )
          : null,
      claims: claims.map((c) => ({
        id: c.id,
        requesterName: text(c.requesterName),
        status: text(c.status),
        handoverStage: text(c.handoverStage) || text(c.opsBookingStatus),
        agreedSlotAt: iso(c.agreedSlotAt),
        createdAt: iso(c.createdAt),
      })),
      notifications: notificationAudit(
        events,
        complete ? "complete" : "partial",
      ),
    };
  }
  async drop(record: ReadRecord): Promise<DropAdminRow | null> {
    const owner = await this.owner(record, null);
    if (owner.tester) return null;
    const linked = await this.query("items", "submissionId", record.id, 5);
    const items = (
      await Promise.all(linked.map((i) => this.wall(i, record)))
    ).filter((i): i is WallAdminItem => !!i);
    const thread = await this.doc("messageThreads", `donation_${record.id}`);
    // No thread is a valid no-conversation state, not a broken entity reference.
    const coverage = this.sources.find(
      (s) => s.source === `messageThreads/donation_${record.id}`,
    );
    if (coverage && !thread) {
      coverage.state = "complete";
      coverage.reason = "No conversation recorded.";
    }
    return {
      id: record.id,
      reference: text(record.reference),
      status: text(record.status),
      createdAt: iso(record.createdAt) || iso(record.submittedAt),
      updatedAt: iso(record.updatedAt),
      dropper: owner.person,
      items,
      hasLinkedItems: linked.length > 0,
      itemsNextCursor:
        this.sources.find((s) => s.source === `items/submissionId/${record.id}`)
          ?.state === "partial"
          ? linkedCursor("items", record.id, linked[linked.length - 1].id)
          : null,
      internalNotes: text(record.internalNotes),
      unreadChat: !!thread?.unreadForAdmin,
    };
  }
}
type ParsedQuery = z.output<typeof inventoryQuery>;
function itemCriteria(item: ReadRecord | WallAdminItem, q: ParsedQuery) {
  return (
    (q.visibility === "all" ||
      (q.visibility === "hidden"
        ? item.publicVisibility === false
        : item.publicVisibility === true)) &&
    (q.availability === "all" || item.publicStatus === q.availability) &&
    (!q.category ||
      text(item.category)?.toLowerCase() === q.category.toLowerCase()) &&
    (!q.gender ||
      text(item.gender)?.toLowerCase() === q.gender.toLowerCase()) &&
    (!q.size || text(item.size)?.toLowerCase() === q.size.toLowerCase())
  );
}
const hasItemFilters = (q: ParsedQuery) =>
  q.visibility !== "all" ||
  q.availability !== "all" ||
  !!q.category ||
  !!q.gender ||
  !!q.size;
const statusMatches = (status: unknown, q: ParsedQuery) =>
  q.status === "all" ||
  (q.status === "submitted"
    ? ["submitted", "pending", "pending_review"].includes(String(status))
    : status === q.status);
const searched = (q: ParsedQuery, values: unknown[]) =>
  !q.search || values.join(" ").toLowerCase().includes(q.search.toLowerCase());
const dated = (q: ParsedQuery) =>
  q.lane === "recent" || !!q.dateFrom || !!q.dateTo;
function primaryQuery(
  db: Firestore,
  kind: Kind,
  q: ParsedQuery,
  cursor: InventoryCursor,
): Query {
  let query: Query = db.collection(
    kind === "drops" ? "donationSubmissions" : "items",
  );
  if (dated(q)) {
    const from = q.dateFrom
      ? new Date(q.dateFrom + "T00:00:00+05:30")
      : new Date(0);
    const through = q.dateTo
      ? new Date(Date.parse(q.dateTo + "T00:00:00+05:30") + 86400000)
      : new Date(cursor.asOf);
    query = query
      .where("createdAt", ">=", Timestamp.fromDate(from))
      .where("createdAt", "<", Timestamp.fromDate(through))
      .orderBy("createdAt", "desc")
      .orderBy(FieldPath.documentId(), "desc");
    if (cursor.after)
      query = query.startAfter(
        new Timestamp(cursor.afterAt!.seconds, cursor.afterAt!.nanoseconds),
        cursor.after,
      );
  } else {
    query = query.orderBy(FieldPath.documentId());
    if (cursor.after) query = query.startAfter(cursor.after);
  }
  return query;
}
function dateCoverage(reader: InventoryReader, q: ParsedQuery) {
  if (dated(q))
    reader.sources.push({
      source: "dated-inventory-scope",
      state: "partial",
      scanned: 0,
      limit: 0,
      reason:
        "Recent/date range uses Firestore createdAt timestamps, ordered newest first. Legacy string dates and undated records are outside this lane; use All records without dates to reach them. Date boundaries use Asia/Kolkata.",
    });
}
async function linkedScan(
  db: Firestore,
  name: string,
  field: string,
  id: string,
  after: string | undefined,
  limit: number,
) {
  let query: Query = db
    .collection(name)
    .where(field, "==", id)
    .orderBy(FieldPath.documentId());
  if (after) query = query.startAfter(after);
  const snap = await query.limit(limit + 1).get();
  return {
    rows: snap.docs
      .slice(0, limit)
      .map((d) => ({ ...d.data(), id: d.id }) as ReadRecord),
    more: snap.size > limit,
    scanned: snap.size,
  };
}
/** A bounded continuation walks linked item/claim windows before advancing a parent.
 * This prevents a filter miss in the first window from permanently discarding that parent. */
async function filteredInventory(
  db: Firestore,
  kind: Kind,
  q: ParsedQuery,
  cursor: InventoryCursor,
) {
  const reader = new InventoryReader(db);
  const items: (DropAdminRow | WallAdminItem)[] = [];
  let more = true;
  const finish = (
    record: ReadRecord,
    pending: z.infer<typeof pendingSchema>,
  ) => {
    cursor.after = record.id;
    cursor.afterAt = timestampPosition(record.createdAt);
    cursor.pending = undefined;
    more = pending.morePrimary;
  };
  for (let work = 0; work < 10 && more && items.length < q.limit; work++) {
    let record: ReadRecord | null;
    if (cursor.pending)
      record = await reader.doc(
        kind === "drops" ? "donationSubmissions" : "items",
        cursor.pending.id,
      );
    else {
      const snap = await primaryQuery(db, kind, q, cursor).limit(2).get();
      reader.sources.push({
        source: `inventory-match-scan/${work}`,
        state: snap.size > 1 ? "partial" : "complete",
        scanned: snap.size,
        limit: 2,
        reason:
          "Bounded parent traversal for linked filtering; continuation may be empty.",
      });
      if (!snap.size) {
        more = false;
        break;
      }
      record = { ...snap.docs[0].data(), id: snap.docs[0].id };
      cursor.pending = {
        id: record.id,
        at: timestampPosition(record.createdAt),
        morePrimary: snap.size > 1,
      };
    }
    const pending = cursor.pending!;
    if (!record) {
      cursor.after = pending.id;
      cursor.afterAt = pending.at;
      cursor.pending = undefined;
      more = pending.morePrimary;
      continue;
    }
    if (!statusMatches(record.status, q)) {
      finish(record, pending);
      continue;
    }
    const submission =
      kind === "wall" && text(record.submissionId)
        ? await reader.doc("donationSubmissions", String(record.submissionId))
        : null;
    const owner = await reader.owner(record, submission);
    if (owner.tester) {
      finish(record, pending);
      continue;
    }
    const direct = searched(q, [
      record.id,
      record.reference,
      ...Object.values(owner.person),
      ...(kind === "wall"
        ? [record.title, record.locality, record.publicArea]
        : []),
    ]);
    if (kind === "drops" && direct && !hasItemFilters(q)) {
      const row = await reader.drop(record);
      if (row) items.push(row);
      finish(record, pending);
      continue;
    }
    let item: ReadRecord | null = kind === "wall" ? record : null;
    if (kind === "drops") {
      if (pending.itemId) item = await reader.doc("items", pending.itemId);
      else {
        const scan = await linkedScan(
          db,
          "items",
          "submissionId",
          record.id,
          pending.itemAfter,
          1,
        );
        item = scan.rows[0] || null;
        pending.moreItems = scan.more;
        pending.itemId = item?.id;
        reader.sources.push({
          source: `item-match-scan/${record.id}/${pending.itemAfter || "start"}`,
          state: scan.more ? "partial" : "complete",
          scanned: scan.scanned,
          limit: 2,
          reason: "Item filters continue across every linked item.",
        });
      }
    }
    let match =
      !!item &&
      itemCriteria(item, q) &&
      (direct ||
        searched(q, [item.id, item.title, item.locality, item.publicArea]));
    let matchingClaim: ReadRecord | undefined;
    if (item && itemCriteria(item, q) && !match && q.search) {
      const scan = await linkedScan(
        db,
        "itemRequests",
        "itemId",
        item.id,
        pending.claimAfter,
        20,
      );
      reader.sources.push({
        source: `claimer-match-scan/${item.id}/${pending.claimAfter || "start"}`,
        state: scan.more ? "partial" : "complete",
        scanned: scan.scanned,
        limit: 21,
        reason: "Claimer search continues across every linked claim.",
      });
      matchingClaim = scan.rows.find(
        (c) =>
          !isTesterDoc(c) &&
          searched(q, [
            c.requesterName,
            c.requesterEmail,
            c.requesterPhone,
            c.requesterTarget,
          ]),
      );
      match = !!matchingClaim;
      if (!match && scan.more) {
        pending.claimAfter = scan.rows[scan.rows.length - 1].id;
        continue;
      }
    }
    if (match && item) {
      const wall = await reader.wall(
        item,
        kind === "drops" ? record : submission,
      );
      if (wall) {
        if (
          matchingClaim &&
          !wall.claims.some((c) => c.id === matchingClaim!.id)
        )
          wall.claims.push(claimRow(matchingClaim));
        if (kind === "wall") items.push(wall);
        else {
          const drop = await reader.drop(record);
          if (drop) {
            drop.items = [wall, ...drop.items.filter((i) => i.id !== wall.id)];
            items.push(drop);
          }
        }
        finish(record, pending);
        continue;
      }
    }
    if (kind === "drops" && item && pending.moreItems) {
      pending.itemAfter = item.id;
      pending.itemId = undefined;
      pending.claimAfter = undefined;
    } else finish(record, pending);
  }
  dateCoverage(reader, q);
  return {
    ...metadata(reader.sources, cursor.asOf),
    items,
    nextCursor: more ? encodeCursor(cursor) : null,
    order: dated(q)
      ? "Newest Firestore creation timestamp first; linked matching may require empty continuation pages."
      : "Document ID ascending; linked filters continue before advancing each parent.",
  };
}
export async function getInventoryPage(
  db: Firestore,
  kind: Kind,
  input: InventoryQuery,
): Promise<Page<DropAdminRow | WallAdminItem>> {
  const q = inventoryQuery.parse(input);
  const cursor: InventoryCursor = q.cursor
    ? decodeInventoryCursor(q.cursor, kind, q)
    : {
        v: 3,
        kind,
        filter: signature(q),
        after: "",
        afterAt: null,
        asOf: new Date().toISOString(),
      };
  if (q.search || (kind === "drops" && hasItemFilters(q)))
    return filteredInventory(db, kind, q, cursor);
  const snap = await primaryQuery(db, kind, q, cursor)
    .limit(q.limit + 1)
    .get();
  const docs = snap.docs.slice(0, q.limit);
  const more = snap.size > q.limit;
  const reader = new InventoryReader(db);
  reader.sources.push({
    source: kind === "drops" ? "donationSubmissions" : "items",
    state: more || q.cursor ? "partial" : "complete",
    scanned: snap.size,
    limit: q.limit + 1,
    reason:
      more || q.cursor
        ? "Continue through all pages; filters may leave a scan empty."
        : null,
  });
  const mapped = await Promise.all(
    docs.map((d) =>
      kind === "drops"
        ? reader.drop({ ...d.data(), id: d.id })
        : reader.wall({ ...d.data(), id: d.id }),
    ),
  );
  const items = mapped.filter(
    (r): r is DropAdminRow | WallAdminItem =>
      !!r &&
      statusMatches(r.status, q) &&
      (kind === "drops" || itemCriteria(r as WallAdminItem, q)),
  );
  dateCoverage(reader, q);
  if (docs.length) {
    cursor.after = docs[docs.length - 1].id;
    cursor.afterAt = timestampPosition(docs[docs.length - 1].data().createdAt);
  }
  return {
    ...metadata(reader.sources, cursor.asOf),
    items,
    nextCursor: more ? encodeCursor(cursor) : null,
    order: dated(q)
      ? "Newest Firestore creation timestamp first. Legacy string/undated records remain in All records."
      : "Document ID ascending; live edits may change membership.",
  };
}
export async function getInventoryLinkedPage(
  db: Firestore,
  kind: "items" | "claims",
  id: string,
  cursor?: string,
): Promise<Page<WallAdminItem | InventoryClaim>> {
  const after = cursor ? decodeLinkedCursor(cursor, kind, id) : undefined;
  const reader = new InventoryReader(db, true);
  const parent = await reader.doc(
    kind === "items" ? "donationSubmissions" : "items",
    id,
  );
  if (!parent) throw new Error("Linked parent not found");
  const owner = await reader.owner(
    parent,
    kind === "claims" && text(parent.submissionId)
      ? await reader.doc("donationSubmissions", String(parent.submissionId))
      : null,
  );
  if (owner.tester) throw new Error("Excluded parent");
  const scan = await linkedScan(
    db,
    kind === "items" ? "items" : "itemRequests",
    kind === "items" ? "submissionId" : "itemId",
    id,
    after,
    kind === "items" ? 5 : 20,
  );
  const items =
    kind === "items"
      ? (
          await Promise.all(scan.rows.map((r) => reader.wall(r, parent)))
        ).filter((r): r is WallAdminItem => !!r)
      : scan.rows.filter((r) => !isTesterDoc(r)).map(claimRow);
  reader.sources.push({
    source: `${kind}/${id}`,
    state: scan.more ? "partial" : "complete",
    scanned: scan.scanned,
    limit: kind === "items" ? 6 : 21,
    reason: scan.more ? "Continue to retrieve more linked records." : null,
  });
  return {
    ...metadata(reader.sources),
    items,
    nextCursor: scan.more
      ? linkedCursor(kind, id, scan.rows[scan.rows.length - 1].id)
      : null,
    order:
      "Linked document ID ascending. Notification summary covers only the first claim window; open a focused claim for its audit.",
  };
}
export async function getInventoryClaimFocus(
  db: Firestore,
  id: string,
): Promise<InventoryClaimFocus | null> {
  const reader = new InventoryReader(db, true);
  const claim = await reader.doc("itemRequests", id);
  if (!claim || isTesterDoc(claim)) return null;
  const itemId = text(claim.itemId);
  const record = itemId ? await reader.doc("items", itemId) : null;
  const item = record ? await reader.wall(record) : null;
  if (record && !item) return null;
  const events = await reader.query("notificationEvents", "claimId", id, 20);
  const audit = notificationAudit(
    events,
    reader.sources.find((s) => s.source === `notificationEvents/claimId/${id}`)!
      .state,
  );
  return {
    ...metadata(reader.sources),
    notifications: audit,
    claim: {
      ...claimRow(claim),
      requesterPhone: text(claim.requesterPhone),
      requesterEmail:
        text(claim.requesterEmail) ||
        (String(claim.requesterTarget || "").includes("@")
          ? text(claim.requesterTarget)
          : null),
      requesterAddress: text(claim.requesterAddress),
      pickupAddress: text(claim.pickupLocality),
      logistics: text(claim.giverLogistics) || text(claim.deliveryMethod),
      opsBookingStatus: text(claim.opsBookingStatus),
      deliveryStatus: text(claim.deliveryStatus),
    },
    item,
  };
}
export async function getInventoryDetail(
  db: Firestore,
  kind: Kind,
  id: string,
): Promise<InventoryDetail | null> {
  const reader = new InventoryReader(db, true);
  const record = await reader.doc(
    kind === "drops" ? "donationSubmissions" : "items",
    id,
  );
  if (!record) return null;
  const row =
    kind === "drops" ? await reader.drop(record) : await reader.wall(record);
  return row ? { ...metadata(reader.sources), ...row } : null;
}
export function inventoryFunnel(): DropFunnel["steps"] {
  return [
    {
      id: "started",
      label: "Drop started",
      value: null,
      source: "analyticsDaily",
      reason:
        "Event attempts are not unique drops and cannot exclude historical testers.",
    },
    ...[
      ["photos", "Photos added"],
      ["details", "Details completed"],
      ["identity", "Identity completed"],
    ].map(([id, label]) => ({
      id,
      label,
      value: null,
      source: "analyticsDaily",
      reason: "The aggregate step event does not identify this step reliably.",
    })),
    {
      id: "submitted",
      label: "Drops created · 7 days",
      value: null,
      source: "donationSubmissions",
      reason: "Complete, tester-filtered creation cohort is required.",
    },
    {
      id: "visible",
      label: "Visible on Wall",
      value: null,
      source: "items",
      reason:
        "Current visibility is not a historical funnel transition; no cohort conversion is inferred.",
    },
  ];
}
export async function getDropFunnel(db: Firestore): Promise<DropFunnel> {
  const overview = await getOverview(db, "7d");
  const drop = overview.kpis.find((k) => k.id === "drops");
  const steps = inventoryFunnel().map((s) =>
    s.id === "submitted"
      ? { ...s, value: drop?.value ?? null, reason: drop?.reason ?? null }
      : s,
  );
  return {
    asOf: overview.asOf,
    sources: overview.sources,
    coverage: "partial",
    scope:
      "Rolling seven-day creation cohort. Unsupported event steps remain unavailable; no conversion rate is calculated. " +
      overview.scope,
    steps,
  };
}

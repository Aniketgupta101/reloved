import {
  FieldPath,
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
} from "../../../../shared/adminControlCenter";
import {
  getOverview,
  iso,
  notificationAudit,
  type ReadRecord,
} from "./adminControlCenter";
import { isTesterDoc } from "./analyticsTesters";
import { findDonorProfileDoc } from "./donorIdentity";

export const inventoryQuery = z
  .object({
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
    cursor: z.string().max(3000).optional(),
  })
  .strict();
type InventoryQuery = z.input<typeof inventoryQuery>;
type Kind = "drops" | "wall";
const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const scope =
  "Live document-ID scans retain undated and hidden records. Filters apply within each bounded scan; continue through empty scans. Known testers are excluded using linked owner identity where available. No global totals or recent-first ordering are implied.";
function signature(input: InventoryQuery) {
  const { cursor: _cursor, ...filters } = inventoryQuery.parse(input);
  return JSON.stringify(filters);
}
export function decodeInventoryCursor(
  cursor: string,
  kind: Kind,
  input: InventoryQuery,
) {
  const parsed = z
    .object({
      v: z.literal(1),
      kind: z.enum(["drops", "wall"]),
      filter: z.string(),
      after: z
        .string()
        .min(1)
        .max(1500)
        .refine((s) => !s.includes("/")),
      asOf: z.string().datetime(),
    })
    .strict()
    .parse(JSON.parse(Buffer.from(cursor, "base64url").toString()));
  if (parsed.kind !== kind || parsed.filter !== signature(input))
    throw new Error("Cursor does not match filters");
  return parsed;
}
function metadata(
  sources: SourceCoverage[],
  asOf = new Date().toISOString(),
): ReadMetadata {
  return {
    asOf,
    sources,
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
    const claims = (
      await this.query(
        "itemRequests",
        "itemId",
        record.id,
        this.detail ? 20 : 5,
      )
    ).filter((c) => !isTesterDoc(c));
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
      createdAt: iso(record.submittedAt) || iso(record.createdAt),
      updatedAt: iso(record.updatedAt),
      dropper: owner.person,
      items,
      internalNotes: text(record.internalNotes),
      unreadChat: !!thread?.unreadForAdmin,
    };
  }
}
function matches(
  row: DropAdminRow | WallAdminItem,
  kind: Kind,
  q: z.output<typeof inventoryQuery>,
) {
  if (
    q.status !== "all" &&
    !(q.status === "submitted"
      ? ["submitted", "pending", "pending_review"].includes(row.status || "")
      : row.status === q.status)
  )
    return false;
  const items =
    kind === "wall" ? [row as WallAdminItem] : (row as DropAdminRow).items;
  if (
    [
      q.visibility !== "all",
      q.availability !== "all",
      !!q.category,
      !!q.gender,
      !!q.size,
    ].some(Boolean) &&
    !items.some(
      (i) =>
        (q.visibility === "all" ||
          (q.visibility === "hidden"
            ? i.publicVisibility === false
            : i.publicVisibility === true)) &&
        (q.availability === "all" || i.publicStatus === q.availability) &&
        (!q.category ||
          i.category?.toLowerCase() === q.category.toLowerCase()) &&
        (!q.gender || i.gender?.toLowerCase() === q.gender.toLowerCase()) &&
        (!q.size || i.size?.toLowerCase() === q.size.toLowerCase()),
    )
  )
    return false;
  const haystack = [
    row.id,
    ...Object.values(row.dropper),
    ...items.flatMap((i) => [
      i.title,
      i.locality,
      ...i.claims.map((c) => c.requesterName),
    ]),
  ]
    .join(" ")
    .toLowerCase();
  return !q.search || haystack.includes(q.search.toLowerCase());
}
export async function getInventoryPage(
  db: Firestore,
  kind: Kind,
  input: InventoryQuery,
): Promise<Page<DropAdminRow | WallAdminItem>> {
  const q = inventoryQuery.parse(input);
  const cursor = q.cursor ? decodeInventoryCursor(q.cursor, kind, q) : null;
  const name = kind === "drops" ? "donationSubmissions" : "items";
  let query: Query = db.collection(name).orderBy(FieldPath.documentId());
  if (cursor) query = query.startAfter(cursor.after);
  const snap = await query.limit(q.limit + 1).get();
  const docs = snap.docs.slice(0, q.limit);
  const more = snap.size > q.limit;
  const reader = new InventoryReader(db);
  reader.sources.push({
    source: name,
    state: more || cursor ? "partial" : "complete",
    scanned: snap.size,
    limit: q.limit + 1,
    reason:
      more || cursor
        ? "This page is one scan of the source. Continue through all pages; filters may leave a scan empty."
        : null,
  });
  const mapped = await Promise.all(
    docs.map((d) =>
      kind === "drops"
        ? reader.drop({ ...d.data(), id: d.id })
        : reader.wall({ ...d.data(), id: d.id }),
    ),
  );
  const items = mapped
    .filter((r): r is DropAdminRow | WallAdminItem => !!r)
    .filter((r) => matches(r, kind, q));
  const asOf = cursor?.asOf || new Date().toISOString();
  return {
    ...metadata(reader.sources, asOf),
    items,
    nextCursor: more
      ? Buffer.from(
          JSON.stringify({
            v: 1,
            kind,
            filter: signature(q),
            after: docs[docs.length - 1].id,
            asOf,
          }),
        ).toString("base64url")
      : null,
    order:
      "Document ID ascending; filters apply within each scan. Live edits may change membership.",
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

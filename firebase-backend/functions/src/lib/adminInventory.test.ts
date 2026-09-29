import assert from "node:assert/strict";
import { test } from "node:test";
import { Timestamp } from "firebase-admin/firestore";
let model: any = {};
try {
  model = require("./adminInventory");
} catch {}
function database(records: Record<string, any[]>) {
  let max = 0;
  const value = (v: any) => v?.toMillis?.() ?? v;
  return {
    get largestRead() {
      return max;
    },
    collection(name: string) {
      let cap = 100000;
      const filters: any[] = [];
      const order: any[] = [];
      let after: any[] | null = null;
      const doc = (r: any) => ({ id: r.id, exists: true, data: () => r });
      const compare = (a: any[], b: any[]) => {
        for (let i = 0; i < order.length; i++) {
          const av = value(a[i]),
            bv = value(b[i]);
          if (av !== bv)
            return (av < bv ? -1 : 1) * (order[i][1] === "desc" ? -1 : 1);
        }
        return 0;
      };
      const keys = (r: any) => order.map(([key]) => r[key]);
      const q: any = {
        orderBy: (field: any, direction = "asc") => {
          order.push([typeof field === "string" ? field : "id", direction]);
          return q;
        },
        startAfter: (...v: any[]) => {
          after = v;
          return q;
        },
        limit: (n: number) => {
          cap = n;
          return q;
        },
        where: (f: string, op: string, v: any) => {
          filters.push([f, op, v]);
          return q;
        },
        doc: (id: string) => ({
          get: async () => {
            const r = (records[name] || []).find((r) => r.id === id);
            return r ? doc(r) : { exists: false };
          },
        }),
        get: async () => {
          assert.ok(cap < 100000, "every query is bounded");
          if (!order.length) order.push(["id", "asc"]);
          const rows = (records[name] || [])
            .filter(
              (r) =>
                order.every(([f]) => r[f] !== undefined) &&
                (!after || compare(keys(r), after) > 0) &&
                filters.every(([f, op, v]) => {
                  if (op === "in") return v.includes(r[f]);
                  if (op === "array-contains") return (r[f] || []).includes(v);
                  if (op === "==") return r[f] === v;
                  if (v?.toMillis && !r[f]?.toMillis) return false;
                  const a = value(r[f]),
                    b = value(v);
                  return op === ">="
                    ? a >= b
                    : op === "<="
                      ? a <= b
                      : op === "<"
                        ? a < b
                        : false;
                }),
            )
            .sort((a, b) => compare(keys(a), keys(b)))
            .slice(0, cap);
          max = Math.max(max, rows.length);
          return {
            docs: rows.map(doc),
            size: rows.length,
            empty: !rows.length,
          };
        },
      };
      return q;
    },
  };
}
test("paged inventory reaches every document without duplicates and binds cursor to filters", async () => {
  assert.equal(typeof model.getInventoryPage, "function");
  const db = database({
    items: Array.from({ length: 47 }, (_, i) => ({
      id: `item-${String(i).padStart(3, "0")}`,
      title: "Coat",
      publicVisibility: i % 2 === 0,
    })),
  });
  let cursor: string | undefined;
  const ids: string[] = [];
  do {
    const p = await model.getInventoryPage(db, "wall", {
      status: "all",
      visibility: "all",
      limit: 10,
      cursor,
    });
    ids.push(...p.items.map((i: any) => i.id));
    cursor = p.nextCursor || undefined;
  } while (cursor);
  assert.equal(ids.length, 47);
  assert.equal(new Set(ids).size, 47);
  assert.ok(db.largestRead <= 51);
  const page = await model.getInventoryPage(db, "wall", {
    status: "all",
    visibility: "all",
    limit: 10,
  });
  assert.throws(() =>
    model.decodeInventoryCursor(page.nextCursor, "wall", {
      status: "all",
      visibility: "hidden",
      limit: 10,
    }),
  );
});
test("All retains hidden and withdrawn items; submitted aliases and empty scans can continue", async () => {
  assert.equal(typeof model.getInventoryPage, "function");
  const db = database({
    items: [
      {
        id: "a",
        publicVisibility: false,
        publicStatus: "withdrawn",
        status: "approved",
      },
      { id: "b", publicVisibility: true, status: "pending_review" },
    ],
  });
  const all = await model.getInventoryPage(db, "wall", {
    status: "all",
    visibility: "all",
    limit: 10,
  });
  assert.equal(all.items.length, 2);
  assert.equal(all.items[0].publicVisibility, false);
  const empty = await model.getInventoryPage(db, "wall", {
    status: "submitted",
    visibility: "all",
    limit: 1,
  });
  assert.equal(empty.items.length, 0);
  assert.ok(empty.nextCursor);
  const next = await model.getInventoryPage(db, "wall", {
    status: "submitted",
    visibility: "all",
    limit: 1,
    cursor: empty.nextCursor,
  });
  assert.equal(next.items[0].id, "b");
});
test("detail joins drop, profile, photos, claim, delivery and real notification outcomes", async () => {
  assert.equal(typeof model.getInventoryDetail, "function");
  const db = database({
    donationSubmissions: [
      { id: "drop", donorTarget: "giver@example.com", donorFirstName: "Giver" },
    ],
    donorProfiles: [
      { id: "profile", target: "giver@example.com", username: "giver-one" },
    ],
    items: [
      {
        id: "item",
        submissionId: "drop",
        title: "Coat",
        images: [{ storagePath: "/one.jpg" }],
      },
    ],
    itemRequests: [
      {
        id: "claim",
        itemId: "item",
        requesterName: "Receiver",
        status: "approved",
        handoverStage: "schedule_agreed",
      },
    ],
    notificationEvents: [
      {
        id: "notice",
        claimId: "claim",
        channel: "sms",
        status: "failed",
        createdAt: "2026-09-29T00:00:00Z",
      },
    ],
  });
  const detail = await model.getInventoryDetail(db, "drops", "drop");
  assert.equal(detail.dropper.username, "giver-one");
  assert.equal(detail.items[0].claims[0].requesterName, "Receiver");
  assert.equal(detail.items[0].claims[0].handoverStage, "schedule_agreed");
  assert.equal(detail.items[0].notifications.sms.latest.status, "failed");
  assert.equal(detail.items[0].images.length, 1);
  const wall = await model.getInventoryDetail(db, "wall", "item");
  assert.equal(wall.submissionId, "drop");
  assert.equal(wall.dropper.name, "Giver");
});
test("known tester owners are excluded through linked profile; missing steps never become funnel conversion", async () => {
  assert.equal(typeof model.getInventoryPage, "function");
  const db = database({
    items: [{ id: "test", donorTarget: "opaque" }],
    donorProfiles: [
      { id: "tester", target: "opaque", email: "aniket@toteminteractive.in" },
    ],
  });
  assert.equal(
    (
      await model.getInventoryPage(db, "wall", {
        status: "all",
        visibility: "all",
        limit: 10,
      })
    ).items.length,
    0,
  );
  const f = model.inventoryFunnel();
  assert.ok(f.every((s: any) => s.value === null));
  assert.ok(f.find((s: any) => s.id === "photos").reason.includes("step"));
  assert.ok(
    f.find((s: any) => s.id === "submitted").source === "donationSubmissions",
  );
});
test("linked query overflow marks claims/audit partial; failed reads do not advance a cursor", async () => {
  const db = database({
    items: [{ id: "item", title: "Coat" }],
    itemRequests: Array.from({ length: 22 }, (_, i) => ({
      id: "claim" + i,
      itemId: "item",
      status: "pending",
    })),
  });
  const detail = await model.getInventoryDetail(db, "wall", "item");
  assert.equal(detail.claims.length, 20);
  assert.equal(detail.notifications.email.state, "partial");
  assert.equal(detail.notifications.email.counts, null);
  assert.ok(
    detail.sources.some(
      (s: any) =>
        s.source === "itemRequests/itemId/item" && s.state === "partial",
    ),
  );
  await assert.rejects(
    () =>
      model.getInventoryPage(
        {
          collection: () => ({
            orderBy() {
              return this;
            },
            limit() {
              return this;
            },
            get: async () => {
              throw new Error("Read failure");
            },
          }),
        },
        "wall",
        { limit: 10 },
      ),
    /Read failure/,
  );
});

import { adminControlCenterFixtures } from "../scripts/seedAdminControlCenter";
test("synthetic claim relationships agree with public Wall lifecycle", () => {
  const fixture = adminControlCenterFixtures();
  for (const claim of fixture.itemRequests) {
    const item = fixture.items.find((i) => i.id === claim.itemId)!;
    assert.ok(item, String(claim.id));
    if (
      claim.handoverStage === "delivered" ||
      claim.handoverStage === "received"
    )
      assert.equal(item.publicStatus, "reloved", String(claim.id));
    else if (claim.status === "approved")
      assert.equal(item.publicStatus, "claimed", String(claim.id));
    else if (claim.status === "pending")
      assert.equal(item.publicStatus, "being_matched", String(claim.id));
  }
});

async function allInventory(db: any, kind: string, filter: any) {
  let cursor: string | undefined;
  const rows: any[] = [];
  let pages = 0;
  do {
    const page = await model.getInventoryPage(db, kind, {
      limit: 2,
      ...filter,
      cursor,
    });
    rows.push(...page.items);
    cursor = page.nextCursor || undefined;
    assert.ok(++pages < 150, "filtered cursor must terminate");
  } while (cursor);
  return rows;
}
test("linked filters and claimer search continue beyond sixth and later links without omitting the parent", async () => {
  const db = database({
    donationSubmissions: [{ id: "drop", donorFirstName: "Giver" }],
    items: Array.from({ length: 61 }, (_, i) => ({
      id: `item-${String(i).padStart(3, "0")}`,
      submissionId: "drop",
      category: i === 60 ? "Unique" : "Other",
      title: "Coat",
    })),
    itemRequests: Array.from({ length: 61 }, (_, i) => ({
      id: `claim-${String(i).padStart(3, "0")}`,
      itemId: "item-060",
      requesterName: i === 60 ? "Unique Claimer" : "Other",
    })),
  });
  const drops = await allInventory(db, "drops", { category: "Unique" });
  assert.deepEqual(
    drops.map((r) => r.id),
    ["drop"],
  );
  assert.ok(drops[0].items.some((i: any) => i.id === "item-060"));
  const walls = await allInventory(db, "wall", { search: "Unique Claimer" });
  assert.deepEqual(
    walls.map((r) => r.id),
    ["item-060"],
  );
  assert.ok(walls[0].claims.some((c: any) => c.id === "claim-060"));
  const searchedDrops = await allInventory(db, "drops", {
    search: "Unique Claimer",
  });
  assert.deepEqual(
    searchedDrops.map((r) => r.id),
    ["drop"],
  );
  assert.ok(db.largestRead <= 51, "individual queries stay bounded");
});
test("focused linked histories expose continuation rather than permanently capping items or claims", async () => {
  assert.equal(typeof model.getInventoryLinkedPage, "function");
  const db = database({
    donationSubmissions: [{ id: "drop" }],
    items: Array.from({ length: 9 }, (_, i) => ({
      id: "item" + i,
      submissionId: "drop",
    })),
    itemRequests: Array.from({ length: 27 }, (_, i) => ({
      id: "claim" + String(i).padStart(2, "0"),
      itemId: "item0",
    })),
  });
  const detail = await model.getInventoryDetail(db, "drops", "drop");
  assert.ok(detail.itemsNextCursor);
  let cursor = detail.itemsNextCursor;
  const ids = detail.items.map((i: any) => i.id);
  do {
    const p = await model.getInventoryLinkedPage(db, "items", "drop", cursor);
    ids.push(...p.items.map((r: any) => r.id));
    cursor = p.nextCursor;
  } while (cursor);
  assert.equal(new Set(ids).size, 9);
  const item = await model.getInventoryDetail(db, "wall", "item0");
  assert.ok(item.claimsNextCursor);
  const claims = await model.getInventoryLinkedPage(
    db,
    "claims",
    "item0",
    item.claimsNextCursor,
  );
  assert.equal(item.claims.length + claims.items.length, 27);
});
test("recent dated lane sorts timestamps with tie-safe cursor; date ranges bind cursors and All keeps undated", async () => {
  assert.equal(typeof model.inventoryQuery.safeParse, "function");
  assert.ok(
    model.inventoryQuery.safeParse({
      lane: "recent",
      dateFrom: "2026-09-28",
      dateTo: "2026-09-29",
    }).success,
  );
  assert.equal(
    model.inventoryQuery.safeParse({ dateFrom: "2026-02-30" }).success,
    false,
  );
});
test("focused claim read resolves the requested ID outside legacy list caps", async () => {
  assert.equal(typeof model.getInventoryClaimFocus, "function");
  const db = database({
    items: [{ id: "item", title: "Focused coat" }],
    itemRequests: [
      {
        id: "claim-beyond-cap",
        itemId: "item",
        requesterName: "Focused Claimer",
        status: "approved",
        agreedSlotAt: "2026-09-29T08:00:00Z",
      },
    ],
  });
  const result = await model.getInventoryClaimFocus(db, "claim-beyond-cap");
  assert.equal(result.claim.id, "claim-beyond-cap");
  assert.equal(result.item.title, "Focused coat");
  assert.equal(result.claim.requesterName, "Focused Claimer");
});

test("dated pages actually order/tie-break timestamps and apply inclusive IST date boundaries", async () => {
  const stamp = (s: string) => Timestamp.fromDate(new Date(s));
  const db = database({
    donationSubmissions: [
      { id: "a", createdAt: stamp("2026-09-28T19:00:00Z") },
      { id: "b", createdAt: stamp("2026-09-28T19:00:00Z") },
      { id: "z-old", createdAt: stamp("2026-09-27T19:00:00Z") },
      { id: "undated" },
      { id: "legacy", createdAt: "2026-09-29T01:00:00Z" },
    ],
    items: [
      { id: "before", createdAt: stamp("2026-09-28T18:29:59Z") },
      { id: "start", createdAt: stamp("2026-09-28T18:30:00Z") },
      { id: "end", createdAt: stamp("2026-09-29T18:30:00Z") },
    ],
  });
  const recent = await allInventory(db, "drops", { lane: "recent" });
  assert.deepEqual(
    recent.map((r) => r.id),
    ["b", "a", "z-old"],
  );
  const all = await allInventory(db, "drops", {});
  assert.equal(all.length, 5);
  const dated = await allInventory(db, "wall", {
    dateFrom: "2026-09-29",
    dateTo: "2026-09-29",
  });
  assert.deepEqual(
    dated.map((r) => r.id),
    ["start"],
  );
  const first = await model.getInventoryPage(db, "drops", {
    lane: "recent",
    limit: 1,
  });
  assert.throws(() =>
    model.decodeInventoryCursor(first.nextCursor, "drops", {
      lane: "all",
      limit: 1,
    }),
  );
});

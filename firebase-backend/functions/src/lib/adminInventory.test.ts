import assert from "node:assert/strict";
import { test } from "node:test";
let model: any = {};
try {
  model = require("./adminInventory");
} catch {}
function database(records: Record<string, any[]>) {
  let max = 0;
  return {
    get largestRead() {
      return max;
    },
    collection(name: string) {
      let after = "",
        cap = 100000,
        filters: any[] = [];
      const doc = (r: any) => ({ id: r.id, exists: true, data: () => r });
      const q: any = {
        orderBy: () => q,
        startAfter: (v: string) => {
          after = v;
          return q;
        },
        limit: (n: number) => {
          cap = n;
          return q;
        },
        where: (f: string, op: string, v: unknown) => {
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
          const rows = (records[name] || [])
            .filter(
              (r) =>
                r.id > after &&
                filters.every(([f, op, v]) =>
                  op === "in"
                    ? v.includes(r[f])
                    : op === "array-contains"
                      ? (r[f] || []).includes(v)
                      : r[f] === v,
                ),
            )
            .sort((a, b) => a.id.localeCompare(b.id))
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

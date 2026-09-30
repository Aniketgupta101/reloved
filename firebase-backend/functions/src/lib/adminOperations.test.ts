import assert from "node:assert/strict";
import { test } from "node:test";
import { Timestamp } from "firebase-admin/firestore";
let model: any = {};
try {
  model = require("./adminOperations");
} catch {}
function database(records: Record<string, any[]>) {
  let max = 0;
  const value = (v: any) =>
    v instanceof Timestamp
      ? BigInt(v.seconds) * 1_000_000_000n + BigInt(v.nanoseconds)
      : v;
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

const now = new Date("2026-09-29T10:00:00Z");
test("operation detail exposes recorded provider and manual payment state without credentials", async () => {
  const claim = {
    id: "courier-claim", status: "approved", courierBookedVia: "borzo_api",
    borzoOrderId: 42, borzoOrderName: "B-42", borzoStatus: "active",
    borzoDeliveryStatus: "on_way", borzoTrackingUrl: "https://track.example/42",
    borzoDeliveryFee: 199, borzoCourier: { name: "Rider", phone: "9000000000" },
    borzoBookedAt: now.toISOString(), borzoUpdatedAt: now.toISOString(),
    borzoPaidBy: "reloved_subsidy", borzoSubsidyIndex: 12,
    shiprocketOrderId: 7, shiprocketShipmentId: 8, shiprocketAwb: "AWB1",
    shadowfaxOrderId: "SF1", shadowfaxAwb: "SFAWB",
    BORZO_AUTH_TOKEN: "never-expose",
  };
  const detail: any = await model.getOperationDetail(database({ itemRequests: [claim] }), claim.id, now);
  assert.equal(detail.courier.borzo.orderId, "42");
  assert.equal(detail.courier.borzo.courierPhone, "9000000000");
  assert.equal(detail.courier.shiprocket.awb, "AWB1");
  assert.equal(detail.courier.shadowfax.orderId, "SF1");
  assert.equal(detail.courier.payment.paidBy, "reloved_subsidy");
  assert.equal(JSON.stringify(detail).includes("never-expose"), false);
});
test("courier prerequisites resolve separate submission and profile pincodes plus claim note fallback", () => {
  const base = { id: "claim", requesterAddress: "Receiver building", note: "Call at 400053" };
  const item = { id: "item", pickupLocality: "Giver building" };
  const submission = { id: "drop", pincode: "400051" };
  const fromSubmission = model.courierPrerequisites(base, item, submission, null, null);
  assert.equal(fromSubmission.pickupPincode, "400051");
  assert.equal(fromSubmission.dropPincode, "400053");
  assert.equal(fromSubmission.pickupAddress, "Giver building 400051");
  assert.equal(fromSubmission.dropAddress, "Receiver building 400053");
  const fromProfiles = model.courierPrerequisites({ ...base, note: null }, item, null, { pincode: "400052" }, { pincode: "400054" });
  assert.equal(fromProfiles.pickupPincode, "400052");
  assert.equal(fromProfiles.dropPincode, "400054");
});
test("operation detail resolves item-first giver identity before a linked submission", async () => {
  const claim = {
    id: "item-owner-claim",
    itemId: "item-owner-item",
    status: "approved",
    requesterAddress: "Receiver building",
    note: "Receiver PIN 400053",
  };
  const detail: any = await model.getOperationDetail(database({
    itemRequests: [claim],
    items: [{
      id: "item-owner-item",
      submissionId: "item-owner-submission",
      donorTarget: "giver@example.com",
      pickupLocality: "Giver building",
    }],
    donationSubmissions: [{
      id: "item-owner-submission",
      email: "legacy-submission@example.com",
    }],
    donorProfiles: [{
      id: "item-owner-profile",
      target: "giver@example.com",
      pincode: "400052",
    }],
    notificationEvents: [],
  }), claim.id, now);
  assert.equal(detail.courierPrerequisites.pickupAddress, "Giver building 400052");
  assert.equal(detail.courierPrerequisites.pickupPincode, "400052");
  assert.equal(detail.courierPrerequisites.dropPincode, "400053");
});
test("operations preserves undated records and pagination across filtered empty windows", async () => {
  assert.equal(typeof model.getOperationsPage, "function");
  const db = database({
    itemRequests: Array.from({ length: 23 }, (_, i) => ({
      id: String(i).padStart(3, "0"),
      status: i === 22 ? "pending" : "rejected",
    })),
  });
  let cursor;
  const ids = [];
  do {
    const p: any = await model.getOperationsPage(
      db,
      "claims",
      { status: "pending", limit: 5, cursor },
      now,
    );
    ids.push(...p.items.map((r: any) => r.id));
    cursor = p.nextCursor || undefined;
  } while (cursor);
  assert.deepEqual(ids, ["022"]);
  assert.ok(db.largestRead <= 21);
  const p: any = await model.getOperationsPage(db, "claims", { limit: 5 }, now);
  assert.throws(() =>
    model.decodeOperationsCursor(p.nextCursor, "claims", {
      limit: 5,
      status: "pending",
    }),
  );
});
test("delivery windows distinguish scheduled, proposed, overdue, completed and undated with IST boundaries", () => {
  assert.equal(typeof model.operationTiming, "function");
  assert.equal(
    model.operationTiming({ agreedSlotAt: "2026-09-29T09:00:00Z" }, now),
    "overdue",
  );
  assert.equal(
    model.operationTiming({ proposedSlotAt: "2026-09-29T09:00:00Z" }, now),
    "proposed",
  );
  assert.equal(model.operationTiming({}, now), "unscheduled");
  assert.equal(
    model.operationTiming({ opsBookingStatus: "delivered" }, now),
    "completed",
  );
  const q = model.operationsQuery.parse({ view: "today" });
  assert.equal(
    model.operationMatches(
      { status: "approved", agreedSlotAt: "2026-09-28T18:30:00Z" },
      "deliveries",
      q,
      now,
    ),
    true,
  );
  assert.equal(
    model.operationMatches(
      { status: "approved", agreedSlotAt: "2026-09-29T18:30:00Z" },
      "deliveries",
      q,
      now,
    ),
    false,
  );
  assert.equal(
    model.operationMatches(
      { status: "pending", agreedSlotAt: now.toISOString() },
      "deliveries",
      q,
      now,
    ),
    false,
  );
  const calendar = model.operationsQuery.parse({
    view: "calendar",
    day: "2026-09-29",
    span: "day",
  });
  assert.equal(
    model.operationMatches(
      {
        status: "approved",
        agreedSlotAt: "2026-09-29T09:00:00Z",
        opsBookingStatus: "delivered",
      },
      "deliveries",
      calendar,
      now,
    ),
    true,
    "calendar includes completed handovers on their scheduled day",
  );
});
test("only manual courier stage capabilities are exposed; self and giver logistics stay usable without false booking", () => {
  assert.equal(typeof model.operationAction, "function");
  for (const mode of [
    "receiver_collects",
    "giver_sends",
    "self_pickup",
    "donor_drop_off",
  ])
    assert.equal(
      model.operationAction(
        {
          status: "approved",
          giverLogistics: mode,
          opsBookingStatus: "ready_to_book",
        },
        now,
      ).kind,
      "coordinate",
    );
  assert.equal(
    model.operationAction({ status: "pending" }, now).kind,
    "review",
  );
  assert.equal(
    model.operationAction(
      {
        status: "approved",
        giverLogistics: "porter_arranged",
        opsBookingStatus: "ready_to_book",
      },
      now,
    ).kind,
    "coordinate",
  );
  assert.equal(
    model.operationAction(
      {
        status: "approved",
        giverLogistics: "porter_arranged",
        opsBookingStatus: "ready_to_book",
        agreedSlotAt: now.toISOString(),
        pickupAddressConfirmedByGiver: true,
        dropAddressConfirmedByClaimer: true,
      },
      now,
    ).opsStatus,
    "booked",
  );
  assert.equal(
    model.operationAction(
      { status: "approved", opsBookingStatus: "delivered" },
      now,
    ).kind,
    "complete",
  );
});
test("linked records and communication continuation never imply absent attempts or invent map coordinates", async () => {
  assert.equal(typeof model.getOperationDetail, "function");
  const db = database({
    itemRequests: [
      {
        id: "c",
        status: "approved",
        itemId: "i",
        requesterName: "Claimer",
        pickupAddress: "Actual pickup",
        pickupLocality: "Area",
      },
    ],
    items: [{ id: "i", title: "Coat", submissionId: "s" }],
    donationSubmissions: [{ id: "s", donorFirstName: "Giver", phone: "123" }],
    notificationEvents: Array.from({ length: 24 }, (_, i) => ({
      id: String(i).padStart(2, "0"),
      claimId: "c",
      channel: "sms",
      status: i % 2 ? "skipped" : "failed",
    })),
  });
  const d = await model.getOperationDetail(db, "c", now);
  assert.equal(d.itemTitle, "Coat");
  assert.equal(d.giverName, "Giver");
  assert.equal(d.pickupAddress, "Actual pickup");
  assert.equal(d.map.state, "unavailable");
  assert.equal(d.notifications.sms.counts, null);
  let cursor;
  const ids = [];
  do {
    const p: any = await model.getCommunications(db, "c", cursor);
    ids.push(...p.items.map((x: any) => x.id));
    cursor = p.nextCursor || undefined;
  } while (cursor);
  assert.equal(new Set(ids).size, 24);
});
test("no attempt is distinct from failed/skipped and valid coordinate pairs stay offline-ready", async () => {
  const db = database({
    itemRequests: [
      {
        id: "c",
        status: "approved",
        itemId: "i",
        requesterLatitude: 19.1,
        requesterLongitude: 72.9,
      },
    ],
    items: [{ id: "i", latitude: 19, longitude: 72.8 }],
  });
  const d = await model.getOperationDetail(db, "c", now);
  assert.deepEqual(d.notifications.sms.counts, {
    sent: 0,
    failed: 0,
    skipped: 0,
  });
  assert.equal(d.notifications.sms.latest, null);
  assert.equal(d.map.state, "available");
});
test("calendar day/week, next48 boundary, completed and legacy string dates have explicit membership", () => {
  const matches = (c: any, q: any) =>
    model.operationMatches(
      { id: "c", status: "approved", ...c },
      "deliveries",
      model.operationsQuery.parse(q),
      now,
    );
  assert.equal(
    matches({ agreedSlotAt: "2026-10-01T10:00:00Z" }, { view: "next48h" }),
    false,
  );
  assert.equal(
    matches({ agreedSlotAt: "2026-10-01T09:59:59Z" }, { view: "next48h" }),
    true,
  );
  assert.equal(
    matches(
      { agreedSlotAt: "2026-10-05T18:29:59Z" },
      { view: "calendar", day: "2026-09-29", span: "week" },
    ),
    true,
  );
  assert.equal(
    matches(
      { agreedSlotAt: "2026-10-05T18:30:00Z" },
      { view: "calendar", day: "2026-09-29", span: "week" },
    ),
    false,
  );
  assert.equal(
    matches({ opsBookingStatus: "delivered" }, { view: "completed" }),
    true,
  );
  assert.equal(matches({}, { view: "unscheduled" }), true);
  assert.equal(
    model.operationsQuery.safeParse({ day: "2026-02-30" }).success,
    false,
  );
});
test("tester profiles exclude linked giver records from operations and communications", async () => {
  const db = database({
    itemRequests: [{ id: "c", itemId: "i", status: "approved" }],
    items: [{ id: "i", donorTarget: "profile-owner@synthetic.invalid" }],
    donorProfiles: [
      {
        id: "profile-owner@synthetic.invalid",
        email: "profile-owner@synthetic.invalid",
        displayName: "Aniket",
      },
    ],
  });
  assert.equal(await model.getOperationDetail(db, "c", now), null);
  await assert.rejects(() => model.getCommunications(db, "c"));
});
test("local fixtures include a synthetic complete coordinate pair and preserve map-unavailable cases", async () => {
  const {
    adminControlCenterFixtures,
  } = require("../scripts/seedAdminControlCenter");
  assert.equal(typeof adminControlCenterFixtures, "function");
  const fixtures = adminControlCenterFixtures();
  const rows = fixtures.itemRequests;
  assert.ok(
    rows.some(
      (r: any) =>
        typeof r.pickupLatitude === "number" &&
        typeof r.pickupLongitude === "number" &&
        typeof r.requesterLatitude === "number" &&
        typeof r.requesterLongitude === "number",
    ),
  );
  assert.ok(
    rows.some(
      (r: any) => r.pickupLatitude == null || r.requesterLatitude == null,
    ),
  );
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { Timestamp } from "firebase-admin/firestore";

let model: any = {};
try { model = require("./adminSupportAnalytics"); } catch {}

const now = new Date("2026-09-29T12:00:00.000Z");

function orderedSupportDb(records: Record<string, any[]>) {
  const value = (entry: any) => entry instanceof Timestamp
    ? BigInt(entry.seconds) * 1_000_000_000n + BigInt(entry.nanoseconds)
    : entry;
  return { collection(name: string) {
    const filters: any[] = []; const orders: any[] = []; let after: any[] | null = null; let cap = 10;
    const query: any = {
      where(field: string, operator: string, expected: any) { filters.push([field, operator, expected]); return query; },
      orderBy(field: any, direction = "asc") { orders.push([typeof field === "string" ? field : "id", direction]); return query; },
      startAfter(...positions: any[]) { after = positions; return query; },
      limit(next: number) { cap = next; return query; },
      async get() {
        const keys = (row: any) => orders.map(([field]) => field === "id" ? row.id : row[field]);
        const compare = (left: any[], right: any[]) => {
          for (let index = 0; index < orders.length; index += 1) {
            const a = value(left[index]); const b = value(right[index]);
            if (a !== b) return (a < b ? -1 : 1) * (orders[index][1] === "desc" ? -1 : 1);
          }
          return 0;
        };
        const rows = (records[name] || [])
          .filter((row) => filters.every(([field, operator, expected]) => operator === "==" && row[field] === expected))
          .sort((a, b) => compare(keys(a), keys(b)))
          .filter((row) => !after || compare(keys(row), after) > 0)
          .slice(0, cap);
        return { docs: rows.map((row) => ({ id: row.id, data: () => row })), size: rows.length };
      },
    };
    return query;
  } };
}

test("support rows unify help chats and contact forms without merging operational chats", () => {
  assert.equal(typeof model.supportRow, "function");
  const chat = model.supportRow("chat", { id: "thread", subjectType: "support", ownerName: "Synthetic Visitor", unreadForAdmin: true, lastMessagePreview: "Help", updatedAt: now.toISOString() });
  const contact = model.supportRow("contact", { id: "contact", name: "Synthetic Sender", email: "sender@synthetic.invalid", message: "Question", status: "actioned", createdAt: now.toISOString() });
  const newContact = model.supportRow("contact", { id: "new-contact", name: "New Sender", status: "new", createdAt: now.toISOString() });
  assert.equal(chat.source, "ask_reloved");
  assert.equal(chat.state, "unread");
  assert.equal(contact.source, "contact_form");
  assert.equal(contact.state, "actioned");
  assert.equal(model.supportMatches(chat, "unread"), true);
  assert.equal(newContact.state, "unread");
  assert.equal(model.supportMatches(newContact, "unread"), true);
  assert.equal(model.supportMatches(newContact, "open"), true);
  assert.equal(model.supportMatches(contact, "open"), false);
});

test("support chat rows expose the stored owner identity used by admin thread open", () => {
  const chat = model.supportRow("chat", {
    id: "support_synthetic_user",
    subjectType: "support",
    subjectId: "synthetic_user",
    ownerTarget: "synthetic-user-uid",
    updatedAt: now.toISOString(),
  });
  assert.equal(chat.chatSubjectId, "synthetic-user-uid");
});

test("analytics never renders unsupported or partial metrics as zero", () => {
  assert.equal(typeof model.buildAnalyticsSnapshot, "function");
  const snapshot = model.buildAnalyticsSnapshot({
    donorProfiles: { rows: [], state: "partial", reason: "cap reached" },
    donationSubmissions: { rows: [], state: "complete", reason: null },
    items: { rows: [], state: "complete", reason: null },
    itemRequests: { rows: [], state: "unavailable", reason: "read failed" },
    analyticsDaily: { rows: [], state: "complete", reason: null },
    notificationEvents: { rows: [], state: "complete", reason: null },
  }, now, "7d");
  assert.equal(snapshot.sections.overview.metrics.find((m: any) => m.id === "users").value, null);
  assert.equal(snapshot.sections.overview.metrics.find((m: any) => m.id === "claims").value, null);
  assert.equal(snapshot.sections.traffic.metrics.find((m: any) => m.id === "visitors").value, null);
  assert.match(snapshot.sections.traffic.metrics.find((m: any) => m.id === "visitors").message, /not configured/i);
  assert.equal(snapshot.coverage, "partial");
});

test("analytics uses only available lifecycle evidence and labels event metrics", () => {
  const complete = (rows: any[]) => ({ rows, state: "complete", reason: null });
  const snapshot = model.buildAnalyticsSnapshot({
    donorProfiles: complete([{ id: "u", createdAt: "2026-09-29T01:00:00Z", onboardedAt: "2026-09-29T02:00:00Z" }]),
    donationSubmissions: complete([{ id: "d", submittedAt: "2026-09-29T03:00:00Z" }]),
    items: complete([{ id: "i", status: "approved", publicVisibility: true, publicStatus: "available", category: "Tops" }]),
    itemRequests: complete([{ id: "c", status: "approved", handoverStage: "delivered", itemId: "i", createdAt: "2026-09-29T04:00:00Z" }]),
    analyticsDaily: complete([{ id: "2026-09-29", e_donation_started: 3, e_item_viewed: 4, e_claim_started: 2 }]),
    notificationEvents: complete([{ id: "n", status: "sent", channel: "email" }]),
  }, now, "7d");
  assert.equal(snapshot.sections.overview.metrics.find((m: any) => m.id === "users").value, 1);
  assert.equal(snapshot.sections.funnels.drop.steps.find((m: any) => m.id === "dropStarted").value, 3);
  assert.equal(snapshot.sections.funnels.claim.steps.find((m: any) => m.id === "itemViewed").value, 4);
  assert.equal(snapshot.sections.overview.metrics.find((m: any) => m.id === "reloved").value, 1);
});

test("analytics suppresses tester-dependent metrics when profile or item coverage is incomplete", () => {
  const complete = (rows: any[]) => ({ rows, state: "complete", reason: null });
  const partial = (rows: any[]) => ({ rows, state: "partial", reason: "cap reached" });
  const snapshot = model.buildAnalyticsSnapshot({
    donorProfiles: partial([]),
    donationSubmissions: complete([]),
    items: partial([]),
    itemRequests: complete([]),
    analyticsDaily: complete([]),
    notificationEvents: complete([]),
  }, now, "7d");
  assert.equal(snapshot.sections.overview.metrics.find((m: any) => m.id === "drops").value, null);
  assert.equal(snapshot.sections.overview.metrics.find((m: any) => m.id === "claims").value, null);
  assert.equal(snapshot.sections.overview.metrics.find((m: any) => m.id === "reloved").value, null);
  assert.equal(snapshot.sections.funnels.drop.steps.find((m: any) => m.id === "visible").value, null);
  assert.equal(snapshot.sections.funnels.claim.steps.find((m: any) => m.id === "matched").value, null);
});

test("drop range uses submittedAt instead of an earlier creation timestamp", () => {
  const complete = (rows: any[]) => ({ rows, state: "complete", reason: null });
  const snapshot = model.buildAnalyticsSnapshot({
    donorProfiles: complete([]),
    donationSubmissions: complete([{ id: "drop", createdAt: "2026-01-01T00:00:00Z", submittedAt: "2026-09-29T03:00:00Z" }]),
    items: complete([]), itemRequests: complete([]), analyticsDaily: complete([]), notificationEvents: complete([]),
  }, now, "7d");
  assert.equal(snapshot.sections.overview.metrics.find((m: any) => m.id === "drops").value, 1);
  assert.match(snapshot.sections.overview.metrics.find((m: any) => m.id === "drops").definition, /submittedAt/);
});

test("analytics ranges enforce the lower bound and exclusive snapshot boundary", () => {
  const complete = (rows: any[]) => ({ rows, state: "complete", reason: null });
  const old = "2020-01-01T00:00:00Z";
  const atSnapshot = now.toISOString();
  const future = "2030-01-01T00:00:00Z";
  const snapshot = model.buildAnalyticsSnapshot({
    donorProfiles: complete([]),
    donationSubmissions: complete([{ id: "old-drop", submittedAt: old }, { id: "boundary-drop", submittedAt: atSnapshot }, { id: "future-drop", submittedAt: future }]),
    items: complete([{ id: "item", publicVisibility: true, publicStatus: "available" }]),
    itemRequests: complete([{ id: "old-claim", itemId: "item", createdAt: old }, { id: "boundary-claim", itemId: "item", createdAt: atSnapshot }, { id: "future-claim", itemId: "item", createdAt: future }]),
    analyticsDaily: complete([]),
    notificationEvents: complete([{ id: "old-failure", status: "failed", createdAt: old }, { id: "boundary-failure", status: "failed", createdAt: atSnapshot }, { id: "future-failure", status: "failed", createdAt: future }]),
  }, now, "7d");
  assert.equal(snapshot.sections.overview.metrics.find((m: any) => m.id === "drops").value, 0);
  assert.equal(snapshot.sections.overview.metrics.find((m: any) => m.id === "claims").value, 0);
  assert.equal(snapshot.sections.product.metrics.find((m: any) => m.id === "claimDemand").value, 0);
  assert.equal(snapshot.sections.dataHealth.metrics.find((m: any) => m.id === "failedNotifications").value, 3);
});

test("focused support resolves exact authenticated source documents outside paginated windows", async () => {
  assert.equal(typeof model.getFocusedSupport, "function");
  const records: Record<string, Record<string, any>> = {
    messageThreads: { old_thread: { subjectType: "support", ownerTarget: "old-user", lastMessageAt: now.toISOString() } },
    contactMessages: { old_message: { status: "new", name: "Old sender", createdAt: now.toISOString() } },
  };
  const db: any = { collection(name: string) { return { doc(id: string) { return { async get() { const data = records[name]?.[id]; return { exists: !!data, id, data: () => data }; } }; } }; } };
  const chat = await model.getFocusedSupport(db, { threadId: "old_thread" });
  const contact = await model.getFocusedSupport(db, { messageId: "old_message" });
  assert.equal(chat?.id, "chat:old_thread");
  assert.equal(contact?.id, "contact:old_message");
  assert.equal(await model.getFocusedSupport(db, { threadId: "missing" }), null);
});

test("support page queries support threads directly in exact descending activity order", async () => {
  const calls: Array<{ collection: string; filters: any[]; orders: any[] }> = [];
  const records: Record<string, any[]> = {
    messageThreads: [
      { id: "support_recent", subjectType: "support", ownerTarget: "recent", lastMessageAt: new Timestamp(1790679600, 123456789) },
      { id: "claim_noise", subjectType: "claim", ownerTarget: "noise", lastMessageAt: Timestamp.fromDate(new Date("2026-09-29T12:00:00Z")) },
      { id: "support_old", subjectType: "support", ownerTarget: "old", lastMessageAt: Timestamp.fromDate(new Date("2026-09-29T09:00:00Z")) },
    ],
    contactMessages: [
      { id: "contact_mid", status: "new", createdAt: Timestamp.fromDate(new Date("2026-09-29T10:00:00Z")) },
    ],
  };
  const value = (v: any) => v instanceof Timestamp ? BigInt(v.seconds) * 1_000_000_000n + BigInt(v.nanoseconds) : v;
  const db: any = { collection(collection: string) {
    const filters: any[] = []; const orders: any[] = []; let after: any[] | null = null; let cap = 100;
    const q: any = {
      where(field: string, op: string, expected: any) { filters.push([field, op, expected]); return q; },
      orderBy(field: any, direction = "asc") { orders.push([typeof field === "string" ? field : "id", direction]); return q; },
      startAfter(...positions: any[]) { after = positions; return q; }, limit(n: number) { cap = n; return q; },
      async get() {
        calls.push({ collection, filters: [...filters], orders: [...orders] });
        const keys = (row: any) => orders.map(([field]) => field === "id" ? row.id : row[field]);
        const compare = (a: any[], b: any[]) => { for (let index=0; index<orders.length; index++) { const av=value(a[index]); const bv=value(b[index]); if(av!==bv) return (av < bv ? -1 : 1) * (orders[index][1] === "desc" ? -1 : 1); } return 0; };
        const rows = records[collection].filter(row => filters.every(([field, op, expected]) => op === "==" && row[field] === expected)).sort((a,b)=>compare(keys(a),keys(b))).filter(row => !after || compare(keys(row), after) > 0).slice(0, cap);
        return { docs: rows.map(row => ({ id: row.id, data: () => row })), size: rows.length };
      },
    }; return q;
  }};
  const first = await model.getSupportPage(db, "all", 2);
  assert.deepEqual(first.items.map((row: any) => row.sourceId), ["support_recent", "contact_mid"]);
  assert.ok(calls.some(call => call.collection === "messageThreads" && call.filters.some(filter => filter[0] === "subjectType" && filter[2] === "support")));
  assert.ok(calls.some(call => call.collection === "messageThreads" && call.orders[0][0] === "lastMessageAt" && call.orders[0][1] === "desc"));
  const second = await model.getSupportPage(db, "all", 2, model.decodeSupportCursor(first.nextCursor, "all"));
  assert.deepEqual(second.items.map((row: any) => row.sourceId), ["support_old"]);
});

test("support pagination uses the same document-ID tie break as its Firestore query", async () => {
  const at = new Timestamp(1790679600, 987654321);
  const records = [{ id: "support_b", subjectType: "support", ownerTarget: "b", lastMessageAt: at }, { id: "support_a", subjectType: "support", ownerTarget: "a", lastMessageAt: at }];
  const value = (v: any) => v instanceof Timestamp ? BigInt(v.seconds) * 1_000_000_000n + BigInt(v.nanoseconds) : v;
  const db: any = { collection(name: string) { const filters:any[]=[]; const orders:any[]=[]; let after:any[]|null=null; let cap=10; const q:any={
    where(f:string,o:string,v:any){filters.push([f,o,v]);return q;}, orderBy(f:any,d="asc"){orders.push([typeof f==="string"?f:"id",d]);return q;}, startAfter(...v:any[]){after=v;return q;}, limit(n:number){cap=n;return q;},
    async get(){ const source=name==="messageThreads"?records:[]; const keys=(r:any)=>orders.map(([f])=>f==="id"?r.id:r[f]); const compare=(a:any[],b:any[])=>{for(let i=0;i<orders.length;i++){const av=value(a[i]),bv=value(b[i]);if(av!==bv)return(av<bv?-1:1)*(orders[i][1]==="desc"?-1:1);}return 0;}; const rows=source.filter(r=>filters.every(([f,,v])=>(r as any)[f]===v)).sort((a,b)=>compare(keys(a),keys(b))).filter(r=>!after||compare(keys(r),after)>0).slice(0,cap);return{docs:rows.map(r=>({id:r.id,data:()=>r})),size:rows.length};}
  };return q;} };
  const seen:string[]=[]; let cursor:any;
  do { const page=await model.getSupportPage(db,"all",1,cursor); seen.push(...page.items.map((row:any)=>row.sourceId)); cursor=page.nextCursor?model.decodeSupportCursor(page.nextCursor,"all"):undefined; } while(cursor);
  assert.deepEqual(seen,["support_b","support_a"]);
});

test("support pagination preserves chat nanoseconds that collapse to the same displayed millisecond", async () => {
  const records = [
    { id: "a-newer", subjectType: "support", ownerTarget: "newer", lastMessageAt: new Timestamp(1790679600, 400_000) },
    { id: "z-older", subjectType: "support", ownerTarget: "older", lastMessageAt: new Timestamp(1790679600, 100_000) },
  ];
  const db = orderedSupportDb({ messageThreads: records, contactMessages: [] });
  const seen: string[] = []; let cursor: any;
  do { const page = await model.getSupportPage(db, "all", 1, cursor); seen.push(...page.items.map((row: any) => row.sourceId)); cursor = page.nextCursor ? model.decodeSupportCursor(page.nextCursor, "all") : undefined; } while (cursor);
  assert.deepEqual(seen, ["a-newer", "z-older"]);
});

test("support pagination preserves contact nanoseconds and descending document-ID ties", async () => {
  const sameMillisecond = [
    { id: "a-newer", status: "new", createdAt: new Timestamp(1790679600, 400_000) },
    { id: "z-older", status: "new", createdAt: new Timestamp(1790679600, 100_000) },
  ];
  const exactTie = [
    { id: "contact-b", status: "new", createdAt: new Timestamp(1790679500, 987_654_321) },
    { id: "contact-a", status: "new", createdAt: new Timestamp(1790679500, 987_654_321) },
  ];
  const db = orderedSupportDb({ messageThreads: [], contactMessages: [...sameMillisecond, ...exactTie] });
  const seen: string[] = []; let cursor: any;
  do { const page = await model.getSupportPage(db, "all", 1, cursor); seen.push(...page.items.map((row: any) => row.sourceId)); cursor = page.nextCursor ? model.decodeSupportCursor(page.nextCursor, "all") : undefined; } while (cursor);
  assert.deepEqual(seen, ["a-newer", "z-older", "contact-b", "contact-a"]);
});

test("contact pagination cannot skip a newer submission when an older contact was updated later", async () => {
  const records = [
    { id: "newer", status: "new", createdAt: Timestamp.fromDate(new Date("2026-09-29T10:00:00Z")), updatedAt: Timestamp.fromDate(new Date("2026-09-29T10:00:00Z")) },
    { id: "older-updated", status: "actioned", createdAt: Timestamp.fromDate(new Date("2026-09-29T09:00:00Z")), updatedAt: Timestamp.fromDate(new Date("2026-09-29T12:00:00Z")) },
  ];
  const value = (v: any) => v instanceof Timestamp ? BigInt(v.seconds) * 1_000_000_000n + BigInt(v.nanoseconds) : v;
  const db: any = { collection(name: string) { const filters:any[]=[]; const orders:any[]=[]; let after:any[]|null=null; let cap=10; const q:any={
    where(f:string,o:string,v:any){filters.push([f,o,v]);return q;}, orderBy(f:any,d="asc"){orders.push([typeof f==="string"?f:"id",d]);return q;}, startAfter(...v:any[]){after=v;return q;}, limit(n:number){cap=n;return q;},
    async get(){ const source=name==="contactMessages"?records:[]; const keys=(r:any)=>orders.map(([f])=>f==="id"?r.id:r[f]); const compare=(a:any[],b:any[])=>{for(let i=0;i<orders.length;i++){const av=value(a[i]),bv=value(b[i]);if(av!==bv)return(av<bv?-1:1)*(orders[i][1]==="desc"?-1:1);}return 0;}; const rows=source.filter(r=>filters.every(([f,,v])=>(r as any)[f]===v)).sort((a,b)=>compare(keys(a),keys(b))).filter(r=>!after||compare(keys(r),after)>0).slice(0,cap);return{docs:rows.map(r=>({id:r.id,data:()=>r})),size:rows.length};}
  };return q;} };
  const seen:string[]=[]; let cursor:any;
  do { const page=await model.getSupportPage(db,"all",1,cursor); seen.push(...page.items.map((row:any)=>row.sourceId)); cursor=page.nextCursor?model.decodeSupportCursor(page.nextCursor,"all"):undefined; } while(cursor);
  assert.deepEqual(seen,["newer","older-updated"]);
});

test("mixed support pagination retains every unreturned row from both sources", () => {
  assert.equal(typeof model.mergeSupportCandidates, "function");
  const chats = [3, 1].map((n) => model.supportRow("chat", { id: `chat-${n}`, subjectType: "support", lastMessageAt: `2026-09-29T0${n}:00:00Z` }));
  const contacts = [4, 2].map((n) => model.supportRow("contact", { id: `contact-${n}`, createdAt: `2026-09-29T0${n}:00:00Z` }));
  const first = model.mergeSupportCandidates(chats, contacts, 2);
  assert.deepEqual(first.items.map((r: any) => r.sourceId), ["contact-4", "chat-3"]);
  assert.deepEqual(first.pendingChatIds, ["chat-1"]);
  assert.deepEqual(first.pendingContactIds, ["contact-2"]);
  const second = model.mergeSupportCandidates(chats.filter((r: any) => first.pendingChatIds.includes(r.sourceId)), contacts.filter((r: any) => first.pendingContactIds.includes(r.sourceId)), 2);
  assert.deepEqual(second.items.map((r: any) => r.sourceId), ["contact-2", "chat-1"]);
});

test("analytics excludes tester-owned drops, items and their downstream claims", () => {
  const complete = (rows: any[]) => ({ rows, state: "complete", reason: null });
  const snapshot = model.buildAnalyticsSnapshot({
    donorProfiles: complete([{ id: "tester", email: "relovedtotem@gmail.com" }, { id: "real", email: "real@synthetic.invalid" }]),
    donationSubmissions: complete([{ id: "td", donorId: "tester", submittedAt: "2026-09-29T11:00:00Z" }, { id: "rd", donorId: "real", submittedAt: "2026-09-29T11:00:00Z" }]),
    items: complete([{ id: "ti", donorId: "tester", publicVisibility: true, publicStatus: "available" }, { id: "ri", donorId: "real", publicVisibility: true, publicStatus: "available" }]),
    itemRequests: complete([{ id: "tc", itemId: "ti", status: "approved", createdAt: "2026-09-29T11:00:00Z" }, { id: "rc", itemId: "ri", status: "approved", createdAt: "2026-09-29T11:00:00Z" }]),
    analyticsDaily: complete([]), notificationEvents: complete([]),
  }, now, "7d");
  assert.equal(snapshot.sections.overview.metrics.find((m: any) => m.id === "drops").value, 1);
  assert.equal(snapshot.sections.overview.metrics.find((m: any) => m.id === "claims").value, 1);
  assert.equal(snapshot.sections.product.metrics.find((m: any) => m.id === "availableSupply").value, 1);
});

const completeSources = (overrides: Record<string, any[]> = {}) => Object.fromEntries(['donorProfiles', 'donationSubmissions', 'items', 'itemRequests', 'analyticsDaily', 'notificationEvents'].map(name => [name, { rows: overrides[name] || [], state: 'complete', reason: null }]));
test('daily operational activity uses IST calendar dates, entity timestamps, and 14 days', () => {
  const snapshot = model.buildAnalyticsSnapshot(completeSources({ donationSubmissions: [{ id: 'd', submittedAt: '2026-09-28T19:00:00Z' }], items: [{ id: 'i' }], itemRequests: [{ id: 'c', itemId: 'i', createdAt: '2026-09-28T19:10:00Z' }], analyticsDaily: [{ id: '2026-09-29', e_donation_started: 900 }] }), now, '14d');
  const drops = snapshot.sections.overview.activity.find((r: any) => r.id === 'drops');
  assert.equal(drops.points.length, 14);
  assert.equal(drops.points.find((p: any) => p.at === '2026-09-29').value, 1);
  assert.equal(drops.points.reduce((n: number, p: any) => n + p.value, 0), 1);
  assert.equal(snapshot.period.from, '2026-09-16');
  for (const f of [snapshot.sections.funnels.drop, snapshot.sections.funnels.claim]) assert.ok(f.steps.every((s: any) => s.rateFromPrevious === null));
});
test('incomplete sources suppress daily points, product rows and data health counts; orphans remain detectable', () => {
  const sources: any = completeSources({ itemRequests: [{ id: 'orphan', itemId: 'gone' }, { id: 'missing' }] });
  const full = model.buildAnalyticsSnapshot(sources, now, '7d');
  assert.equal(full.sections.dataHealth.issues.find((r: any) => r.id === 'missingItem').count, 2);
  sources.items.state = 'partial'; sources.notificationEvents.state = 'unavailable';
  const partial = model.buildAnalyticsSnapshot(sources, now, '7d');
  assert.equal(partial.sections.product.categories.length, 0);
  assert.equal(partial.sections.product.wallStatus.length, 0);
  assert.equal(partial.sections.dataHealth.metrics.find((m: any) => m.id === 'liveWall').value, null);
  assert.ok(partial.sections.dataHealth.issues.every((m: any) => m.count === null));
  assert.ok(partial.sections.overview.activity.find((r: any) => r.id === 'claims').points.every((p: any) => p.value === null));
});
test('product parity exposes decisions, exact timestamp medians and role overlap with sample coverage', () => {
  const snapshot = model.buildAnalyticsSnapshot(completeSources({
    donorProfiles: [{ id: 'u', email: 'person@synthetic.invalid', onboardedAt: '2026-09-20T00:00:00Z' }],
    donationSubmissions: [{ id: 'd', donorId: 'u', submittedAt: '2026-09-20T00:00:00Z', publicArea: 'Bandra' }],
    items: [{ id: 'i', donorId: 'u', category: 'Tops', gender: 'women', size: 'M', publicVisibility: true, publicStatus: 'available', createdAt: '2026-09-01T00:00:00Z' }],
    itemRequests: [{ id: 'c', itemId: 'i', requesterEmail: 'person@synthetic.invalid', status: 'approved', createdAt: '2026-09-29T00:00:00Z', reviewedAt: '2026-09-29T02:00:00Z' }, { id: 'r', itemId: 'i', status: 'rejected', softDecline: true, createdAt: '2026-09-29T00:00:00Z' }, { id: 'p', itemId: 'i', status: 'pending', createdAt: '2026-09-29T00:00:00Z' }],
  }), now, '14d');
  const p = snapshot.sections.product;
  assert.equal(p.metrics.find((m: any) => m.id === 'claimAcceptance').value, 50);
  assert.equal(p.metrics.find((m: any) => m.id === 'medianMatch').value, 2);
  assert.match(p.metrics.find((m: any) => m.id === 'medianMatch').definition, /n=1/);
  assert.equal(p.roles.find((r: any) => r.id === 'both').value, 1);
  assert.equal(p.audiences[0].label, 'women'); assert.equal(p.sizes[0].label, 'M');
  assert.equal(p.attention.find((r: any) => r.id === 'agedAvailable').count, 1);
  assert.equal(snapshot.sections.funnels.activation[0].value, 1);
});

test('missing entity dates cannot become a believable zero in period metrics or daily activity', () => {
  const snapshot = model.buildAnalyticsSnapshot(completeSources({ donationSubmissions: [{ id: 'undated' }], items: [{ id: 'i' }], itemRequests: [{ id: 'undated-claim', itemId: 'i' }] }), now, '7d');
  assert.equal(snapshot.sections.overview.metrics.find((m: any) => m.id === 'drops').value, null);
  assert.equal(snapshot.sections.overview.metrics.find((m: any) => m.id === 'claims').value, null);
  assert.ok(snapshot.sections.overview.activity.find((r: any) => r.id === 'drops').points.every((p: any) => p.value === null));
  assert.equal(snapshot.sections.dataHealth.lastAnalyticsActivityAt, null);
});

test('area comparisons reduce private address fields to verified public neighbourhoods', () => {
  const snapshot = model.buildAnalyticsSnapshot(completeSources({
    donationSubmissions: [{ id: 'd', submittedAt: '2026-09-29T03:00:00Z', pickupLocality: 'Flat 77, Secret Building, Bandra West, Mumbai 400050' }],
    items: [{ id: 'i' }], itemRequests: [{ id: 'c', itemId: 'i', createdAt: '2026-09-29T04:00:00Z', requesterAddress: 'Flat 12, Another Building, Andheri West, Mumbai' }],
  }), now, '7d');
  assert.match(snapshot.sections.product.dropAreas[0].label, /Bandra/);
  assert.match(snapshot.sections.product.claimAreas[0].label, /Andheri/);
  assert.doesNotMatch(JSON.stringify([snapshot.sections.product.dropAreas, snapshot.sections.product.claimAreas]), /Secret|Building|Flat|77|12/);
});
test('age summaries include the exact threshold and cannot certify undated candidates', () => {
  const sources: any = completeSources({ items: [{ id: 'i', publicVisibility: true, publicStatus: 'available', createdAt: '2026-09-22T12:00:00Z' }], itemRequests: [{ id: 'c', status: 'pending', itemId: 'i', createdAt: '2026-09-26T12:00:00Z' }] });
  const snapshot = model.buildAnalyticsSnapshot(sources, now, '7d');
  assert.equal(snapshot.sections.product.attention[0].count, 1);
  assert.equal(snapshot.sections.product.attention.find((r: any) => r.id === "pendingClaims").count, 1);
  sources.items.rows.push({ id: 'undated', publicVisibility: true, publicStatus: 'available' });
  assert.equal(model.buildAnalyticsSnapshot(sources, now, '7d').sections.product.attention[0].count, null);
  assert.equal(model.buildAnalyticsSnapshot({}, now, '7d').coverage, 'partial');
});

test('matching Wall inventory retains its own age alert even with an approved claim', () => {
  const sources: any = completeSources({ items: [{ id: 'matching', publicStatus: 'being_matched', createdAt: '2026-09-26T12:00:00Z' }], itemRequests: [{ id: 'accepted', itemId: 'matching', status: 'approved', createdAt: '2026-09-27T12:00:00Z' }] });
  const product = model.buildAnalyticsSnapshot(sources, now, '7d').sections.product;
  assert.equal(product.attention.find((r: any) => r.id === 'stuckMatching').count, 1);
  assert.match(product.attention.find((r: any) => r.id === 'stuckMatching').message, /creation/i);
  assert.ok(product.attentionItems.some((r: any) => r.href === '/admin/items?itemId=matching'));
  sources.items.rows.push({ id: 'undated-match', publicStatus: 'being_matched' });
  assert.equal(model.buildAnalyticsSnapshot(sources, now, '7d').sections.product.attention.find((r: any) => r.id === 'stuckMatching').count, null);
  sources.items.rows.pop(); sources.items.state = 'partial';
  assert.equal(model.buildAnalyticsSnapshot(sources, now, '7d').sections.product.attention.find((r: any) => r.id === 'stuckMatching').count, null);
});
test('incomplete acceptance evidence cannot leak exact-looking totals into metric definitions', () => {
  for (const name of ['donorProfiles', 'items', 'itemRequests']) for (const state of ['partial', 'unavailable']) {
    const sources: any = completeSources({ items: [{ id: 'i' }], itemRequests: [{ id: 'a', itemId: 'i', status: 'approved' }] });
    sources[name].state = state;
    const snapshot = model.buildAnalyticsSnapshot(sources, now, '7d');
    for (const metric of [snapshot.sections.product.metrics.find((m: any) => m.id === 'claimAcceptance'), snapshot.sections.overview.conversion[0]]) {
      assert.equal(metric.value, null);
      assert.doesNotMatch(metric.definition, /\d/);
      assert.match(metric.definition, /unavailable|incomplete/i);
    }
  }
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { Timestamp } from "firebase-admin/firestore";

let model: any = {};
try { model = require("./adminSupportAnalytics"); } catch {}

const now = new Date("2026-09-29T12:00:00.000Z");

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
  assert.equal(snapshot.sections.overview.find((m: any) => m.id === "users").value, null);
  assert.equal(snapshot.sections.overview.find((m: any) => m.id === "claims").value, null);
  assert.equal(snapshot.sections.retention[0].value, null);
  assert.equal(snapshot.sections.retention[0].message, "Not enough reliable data yet.");
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
  assert.equal(snapshot.sections.overview.find((m: any) => m.id === "users").value, 1);
  assert.equal(snapshot.sections.dropFunnel.find((m: any) => m.id === "dropStarted").value, 3);
  assert.equal(snapshot.sections.claimFunnel.find((m: any) => m.id === "itemViewed").value, 4);
  assert.equal(snapshot.sections.fulfillment.find((m: any) => m.id === "delivered").value, 1);
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
  assert.equal(snapshot.sections.overview.find((m: any) => m.id === "drops").value, null);
  assert.equal(snapshot.sections.overview.find((m: any) => m.id === "claims").value, null);
  assert.equal(snapshot.sections.overview.find((m: any) => m.id === "reloved").value, null);
  assert.equal(snapshot.sections.dropFunnel.find((m: any) => m.id === "visible").value, null);
  assert.equal(snapshot.sections.claimFunnel.find((m: any) => m.id === "matched").value, null);
  assert.equal(snapshot.sections.fulfillment.find((m: any) => m.id === "delivered").value, null);
});

test("drop range uses submittedAt instead of an earlier creation timestamp", () => {
  const complete = (rows: any[]) => ({ rows, state: "complete", reason: null });
  const snapshot = model.buildAnalyticsSnapshot({
    donorProfiles: complete([]),
    donationSubmissions: complete([{ id: "drop", createdAt: "2026-01-01T00:00:00Z", submittedAt: "2026-09-29T03:00:00Z" }]),
    items: complete([]), itemRequests: complete([]), analyticsDaily: complete([]), notificationEvents: complete([]),
  }, now, "7d");
  assert.equal(snapshot.sections.overview.find((m: any) => m.id === "drops").value, 1);
  assert.match(snapshot.sections.overview.find((m: any) => m.id === "drops").definition, /submittedAt/);
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
    donationSubmissions: complete([{ id: "td", donorId: "tester", submittedAt: now.toISOString() }, { id: "rd", donorId: "real", submittedAt: now.toISOString() }]),
    items: complete([{ id: "ti", donorId: "tester", publicVisibility: true, publicStatus: "available" }, { id: "ri", donorId: "real", publicVisibility: true, publicStatus: "available" }]),
    itemRequests: complete([{ id: "tc", itemId: "ti", status: "approved", createdAt: now.toISOString() }, { id: "rc", itemId: "ri", status: "approved", createdAt: now.toISOString() }]),
    analyticsDaily: complete([]), notificationEvents: complete([]),
  }, now, "7d");
  assert.equal(snapshot.sections.overview.find((m: any) => m.id === "drops").value, 1);
  assert.equal(snapshot.sections.overview.find((m: any) => m.id === "claims").value, 1);
  assert.equal(snapshot.sections.supplyDemand.find((m: any) => m.id === "availableSupply").value, 1);
});

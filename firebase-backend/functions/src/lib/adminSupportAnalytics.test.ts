import assert from "node:assert/strict";
import { test } from "node:test";

let model: any = {};
try { model = require("./adminSupportAnalytics"); } catch {}

const now = new Date("2026-09-29T12:00:00.000Z");

test("support rows unify help chats and contact forms without merging operational chats", () => {
  assert.equal(typeof model.supportRow, "function");
  const chat = model.supportRow("chat", { id: "thread", subjectType: "support", ownerName: "Synthetic Visitor", unreadForAdmin: true, lastMessagePreview: "Help", updatedAt: now.toISOString() });
  const contact = model.supportRow("contact", { id: "contact", name: "Synthetic Sender", email: "sender@synthetic.invalid", message: "Question", status: "actioned", createdAt: now.toISOString() });
  assert.equal(chat.source, "ask_reloved");
  assert.equal(chat.state, "unread");
  assert.equal(contact.source, "contact_form");
  assert.equal(contact.state, "actioned");
  assert.equal(model.supportMatches(chat, "unread"), true);
  assert.equal(model.supportMatches(contact, "open"), false);
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
    analyticsDaily: complete([{ id: "2026-09-29", e_item_viewed: 4, e_claim_started: 2 }]),
    notificationEvents: complete([{ id: "n", status: "sent", channel: "email" }]),
  }, now, "7d");
  assert.equal(snapshot.sections.overview.find((m: any) => m.id === "users").value, 1);
  assert.equal(snapshot.sections.claimFunnel.find((m: any) => m.id === "itemViewed").value, 4);
  assert.equal(snapshot.sections.fulfillment.find((m: any) => m.id === "delivered").value, 1);
});

test("mixed support pagination retains every unreturned row from both sources", () => {
  assert.equal(typeof model.mergeSupportCandidates, "function");
  const chats = [3, 1].map((n) => model.supportRow("chat", { id: `chat-${n}`, subjectType: "support", updatedAt: `2026-09-29T0${n}:00:00Z` }));
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
    donationSubmissions: complete([{ id: "td", donorId: "tester", createdAt: now.toISOString() }, { id: "rd", donorId: "real", createdAt: now.toISOString() }]),
    items: complete([{ id: "ti", donorId: "tester", publicVisibility: true, publicStatus: "available" }, { id: "ri", donorId: "real", publicVisibility: true, publicStatus: "available" }]),
    itemRequests: complete([{ id: "tc", itemId: "ti", status: "approved", createdAt: now.toISOString() }, { id: "rc", itemId: "ri", status: "approved", createdAt: now.toISOString() }]),
    analyticsDaily: complete([]), notificationEvents: complete([]),
  }, now, "7d");
  assert.equal(snapshot.sections.overview.find((m: any) => m.id === "drops").value, 1);
  assert.equal(snapshot.sections.overview.find((m: any) => m.id === "claims").value, 1);
  assert.equal(snapshot.sections.supplyDemand.find((m: any) => m.id === "availableSupply").value, 1);
});

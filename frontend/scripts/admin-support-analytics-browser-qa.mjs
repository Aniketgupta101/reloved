import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const origin = "http://127.0.0.1:3100";
const output = new URL("../qa-artifacts/admin-control-center/task-6/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
const external = [], errors = [], responses = [];
await context.route("**/*", route => {
  const url = new URL(route.request().url());
  if (url.origin !== origin) { external.push(url.href); return route.abort(); }
  return route.continue();
});
const page = await context.newPage();
page.on("pageerror", error => errors.push(error.message));
page.on("response", response => { if (response.status() >= 400 && ![400,401,503].includes(response.status())) responses.push(`${response.status()} ${response.url()}`); });
const shot = async name => { await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)), fullPage: true }); };

await page.goto(origin + "/admin/messages");
await page.waitForURL("**/admin/login");
await page.locator("input[type=email]").fill("admin@synthetic.invalid");
await page.locator("input[type=password]").fill("synthetic-local-admin");
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.waitForURL("**/admin");
const token = await page.evaluate(() => localStorage.getItem("reloved_admin_token"));
const headers = { Authorization: `Bearer ${token}` };
assert.equal((await page.request.get(origin + "/api/admin/control-center/support")).status(), 401);
assert.equal((await page.request.get(origin + "/api/admin/control-center/support?cursor=bad", { headers })).status(), 400);

await page.goto(origin + "/admin/messages");
await page.getByText("Synthetic Chat Visitor", { exact: true }).waitFor();
assert.equal(await page.getByText("Ask Reloved chat", { exact: true }).count(), 1);
await shot("support-unread-1440");
await page.getByRole("button", { name: /^all$/i }).click();
await page.getByText("Synthetic Resolved Sender", { exact: true }).waitFor();
assert.equal(await page.getByText("Contact form", { exact: true }).count(), 2);
await page.getByRole("button", { name: "Email reply", exact: true }).first().click();
await page.getByLabel(/Reply to Synthetic/).fill("Synthetic reply draft");
assert.equal(await page.getByLabel(/Reply to Synthetic/).getAttribute("maxlength"), "4000");
await page.getByRole("button", { name: "Cancel", exact: true }).click();
await shot("support-all-1440");

await page.goto(origin + "/admin/analytics");
await page.getByRole("heading", { name: "Retention", exact: true, level: 2 }).waitFor();
await page.getByText("Not enough reliable data yet.", { exact: true }).first().waitFor();
assert.equal(await page.locator(".analytics-metric.is-unavailable .metric-value").count(), 0);
assert.equal(await page.getByText("12", { exact: true }).count() > 0, true, "mirrored item views render");
await shot("analytics-1440");
await page.getByRole("button", { name: "Last 30 days", exact: true }).click();
await page.getByText("12", { exact: true }).waitFor();

await page.setViewportSize({ width: 390, height: 844 });
await shot("analytics-390");
await page.goto(origin + "/admin/messages");
await page.getByText("Synthetic Chat Visitor", { exact: true }).waitFor();
await shot("support-390");
await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
assert.equal(await page.locator("body").evaluate(el => el.scrollWidth <= el.clientWidth + 2), true, "support has no page-level horizontal overflow at 200% text");
await shot("support-390-text-200");

await page.setViewportSize({ width: 1440, height: 1000 });
await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
await context.route("**/api/admin/control-center/support?*", route => route.fulfill({ status: 503, json: { error: "synthetic outage" } }));
await page.getByRole("button", { name: "Refresh", exact: true }).click();
await page.getByText("Refresh failed · showing previous data", { exact: true }).waitFor();
assert.equal(await page.getByText("Synthetic Chat Visitor", { exact: true }).count(), 1, "prior support data remains visible");
await shot("support-stale-1440");

assert.deepEqual(external, []);
assert.deepEqual(errors, []);
assert.deepEqual(responses, []);
await writeFile(new URL("browser-proof.json", output), JSON.stringify({ origin, externalRequests: external, pageErrors: errors, unexpectedResponses: responses, reducedMotion: true, screenshots: 6 }, null, 2));
await browser.close();
console.log("Support/Analytics browser QA passed: same-origin only, responsive and stale-state proof captured.");

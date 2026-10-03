import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const origin = "http://127.0.0.1:3100";
const output = new URL(
  "../qa-artifacts/admin-control-center/task-5/",
  import.meta.url,
);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
  reducedMotion: "reduce",
});
const unexpected = [],
  errors = [],
  requests = [];
let mockCalls = 0;
await context.route("**/*", (route) => {
  const url = new URL(route.request().url());
  requests.push(url.pathname);
  if (url.origin !== origin) {
    unexpected.push(url.href);
    return route.abort();
  }
  return route.continue();
});
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
const shot = async (name) => {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: fileURLToPath(new URL(name + ".png", output)),
  });
};
try {
  await page.goto(origin + "/admin/orders");
  await page.waitForURL("**/admin/login");
  await page.locator("input[type=email]").fill("admin@synthetic.invalid");
  await page.locator("input[type=password]").fill("synthetic-local-admin");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/admin");
  const token = await page.evaluate(() =>
    localStorage.getItem("reloved_admin_token"),
  );
  const headers = { Authorization: "Bearer " + token };
  const read = async (path) => {
    const r = await page.request.get(
      origin + "/api/admin/control-center/" + path,
      { headers },
    );
    assert.equal(r.status(), 200, await r.text());
    return r.json();
  };
  assert.equal(
    (
      await page.request.get(origin + "/api/admin/control-center/claims")
    ).status(),
    401,
  );
  assert.equal(
    (
      await page.request.get(
        origin + "/api/admin/control-center/deliveries?day=bad",
        { headers },
      )
    ).status(),
    400,
  );
  let cursor,
    ids = [];
  do {
    const p = await read(
      "claims?limit=10" +
        (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
    );
    ids.push(...p.items.map((r) => r.id));
    cursor = p.nextCursor;
  } while (cursor);
  assert.equal(ids.length, new Set(ids).size);
  assert.ok(ids.length >= 43);
  await page.goto(origin + "/admin/item-requests");
  await page.locator(".operation-card").first().waitFor();
  assert.ok(
    await page
      .locator(".operation-item > span")
      .first()
      .evaluate((e) => e.getBoundingClientRect().width <= 70),
    "photo wrapper stays compact",
  );
  await shot("claims-1440");
  await page.goto(origin + "/admin/item-requests?claimId=qa-claim-pending");
  await page.getByRole("button", { name: "Accept claim", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm update", exact: true })
    .click();
  await page.getByText("Record updated.", { exact: false }).waitFor();
  assert.equal((await read("claims/qa-claim-pending")).claimStatus, "approved");
  await page
    .getByRole("link", { name: "Open in Deliveries", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Delivery details", exact: true })
    .waitFor();
  await shot("matched-delivery-1440");
  await page.goto(origin + "/admin/orders");
  await page.getByText("records in this scan", { exact: false }).waitFor();
  await shot("deliveries-today-1440");
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await page.getByText("Map unavailable", { exact: true }).waitFor();
  await shot("map-fallback-1440");
  await page
    .getByRole("button", { name: "All deliveries", exact: true })
    .click();
  await page.getByRole("button", { name: "Map", exact: true }).click();
  for (
    let n = 0;
    n < 8 && !(await page.locator(".operation-map svg").count());
    n++
  ) {
    const response = page.waitForResponse(
      (r) =>
        r.url().includes("/control-center/deliveries?") &&
        r.request().method() === "GET",
    );
    await page.getByRole("button", { name: "Next scan", exact: true }).click();
    await response;
    await page.getByRole("button", { name: "Refresh", exact: true }).waitFor();
    await page.waitForTimeout(100);
  }
  await page.locator(".operation-map svg").waitFor();
  assert.ok((await page.locator(".operation-map svg circle").count()) > 0);
  await shot("map-coordinates-1440");

  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await page.getByLabel("Calendar span").selectOption("week");
  await page.locator(".operation-calendar").waitFor();
  const tops = await page
    .locator(".operation-calendar > div")
    .evaluateAll((es) =>
      es.map((e) => Math.round(e.getBoundingClientRect().top)),
    );
  assert.equal(new Set(tops).size, 1, "seven calendar columns align");
  await shot("calendar-week-1440");
  await page.getByLabel("Calendar span").selectOption("day");
  await shot("calendar-day-1440");
  await page.getByRole("button", { name: "Next 48h", exact: true }).click();
  await page.getByText("records in this scan", { exact: false }).waitFor();
  await shot("next48h-1440");
  await page.goto(origin + "/admin/orders?claimId=qa-delivery-today");
  await page
    .getByRole("button", { name: "Mark out for delivery", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm update", exact: true })
    .click();
  await page.getByText("Record updated.", { exact: false }).waitFor();
  assert.equal(
    (await read("deliveries/qa-delivery-today")).opsBookingStatus,
    "out_for_delivery",
  );
  await page
    .getByRole("button", { name: "Confirm delivered", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm update", exact: true })
    .click();
  await page.getByText("Record updated.", { exact: false }).waitFor();
  assert.equal(
    (await read("deliveries/qa-delivery-today")).timing,
    "completed",
  );
  await page
    .getByRole("button", { name: "Preview recorded template", exact: true })
    .first()
    .click();
  await page.getByRole("region", { name: "Notification preview" }).waitFor();
  await page
    .getByRole("region", { name: "Notification preview" })
    .scrollIntoViewIfNeeded();
  await shot("communication-preview-1440");
  await page
    .getByRole("button", { name: "Close preview", exact: true })
    .click();
  const audit = await read("deliveries/qa-delivery-today/communications");
  assert.ok(audit.items.some((e) => e.status === "failed"));
  assert.ok(audit.items.some((e) => e.status === "skipped"));
  assert.ok(audit.items.some((e) => e.status === "sent"));
  await context.route("**/api/admin/calls/masking-status", (route) =>
    route.fulfill({ json: { configured: true } }),
  );
  await context.route("**/api/admin/calls/mask", (route) => {
    mockCalls++;
    assert.equal(
      route.request().postDataJSON().subjectId,
      "qa-delivery-within-hour",
    );
    return route.fulfill({
      json: { message: "Synthetic masked adapter accepted" },
    });
  });
  await page.goto(origin + "/admin/orders?claimId=qa-delivery-within-hour");
  await page
    .getByRole("button", { name: "Ops ↔ Claimer", exact: true })
    .click();
  await page
    .getByText("Synthetic masked adapter accepted", { exact: true })
    .waitFor();
  assert.equal(mockCalls, 1);
  await page.goto(origin + "/admin/orders");
  await page.getByText("records in this scan", { exact: false }).waitFor();
  await context.route("**/api/admin/control-center/deliveries?*", (route) =>
    route.fulfill({ status: 503, json: { error: "synthetic outage" } }),
  );
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page
    .getByText("Refresh failed · showing previous data", { exact: true })
    .waitFor();
  await shot("deliveries-stale-1440");
  await context.unroute("**/api/admin/control-center/deliveries?*");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page
    .getByText("Refresh failed · showing previous data", { exact: true })
    .waitFor({ state: "hidden" });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const [name, path] of [
      ["claims", "/admin/item-requests"],
      ["deliveries", "/admin/orders"],
      ["detail", "/admin/orders?claimId=qa-delivery-today"],
    ]) {
      await page.goto(origin + path);
      await page.locator(".admin-source-details").first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        name + " " + width,
      );
      await shot(`${name}-${width}`);
    }
  }
  assert.deepEqual(unexpected, []);
  assert.deepEqual(errors, []);
  assert.ok(
    !requests.some((p) =>
      /borzo.*book|shiprocket.*book|shadowfax.*book/.test(p),
    ),
  );
  await writeFile(
    new URL("proof.json", output),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        origin,
        requests: requests.length,
        unexpected,
        errors,
        mockCalls,
        checks: [
          "auth/query validation",
          "unique terminating claim cursor",
          "pending to approved via existing mutation",
          "focused delivery link",
          "manual delivery stages via existing mutation",
          "recorded sent/failed/skipped",
          "real template preview",
          "masked adapter interception",
          "zero courier bookings",
          "IST calendar day/week",
          "map unavailable with usable list",
          "dated stale refresh recovery",
          "1440/390/320 bounds",
        ],
      },
      null,
      2,
    ),
  );
  console.log("Task 5 browser proof passed", requests.length, "local requests");
} finally {
  await browser.close();
}

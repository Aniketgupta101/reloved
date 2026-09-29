import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const origin = "http://127.0.0.1:3100";
const output = new URL(
  "../qa-artifacts/admin-control-center/task-4/",
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
page.on("pageerror", (error) => errors.push(error.message));
const shot = async (name) => {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: fileURLToPath(new URL(name + ".png", output)),
  });
};
const loaded = async () => page.locator(".inventory-row").first().waitFor();
const dialog = page.getByRole("dialog");
try {
  const doc = await page.goto(origin + "/admin/items");
  assert.match(await doc.text(), /\/assets\/index-/);
  await page.waitForURL("**/admin/login");
  await page.locator("input[type=email]").fill("admin@synthetic.invalid");
  await page.locator("input[type=password]").fill("synthetic-local-admin");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/admin");
  const token = await page.evaluate(() =>
    localStorage.getItem("reloved_admin_token"),
  );
  const read = async (path) => {
    const response = await page.request.get(
      origin + "/api/admin/control-center/" + path,
      { headers: { Authorization: "Bearer " + token } },
    );
    assert.equal(response.status(), 200, await response.text());
    return response.json();
  };
  assert.equal(
    (
      await page.request.get(origin + "/api/admin/control-center/wall")
    ).status(),
    401,
  );
  for (const path of [
    "wall?limit=999",
    "wall?cursor=bad",
    "drops?visibility=invalid",
  ])
    assert.equal(
      (
        await page.request.get(origin + "/api/admin/control-center/" + path, {
          headers: { Authorization: "Bearer " + token },
        })
      ).status(),
      400,
    );
  const seen = [];
  let cursor;
  do {
    const p = await read(
      "wall?limit=3" + (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
    );
    seen.push(...p.items.map((i) => i.id));
    cursor = p.nextCursor;
    assert.ok(seen.length < 100);
  } while (cursor);
  assert.equal(new Set(seen).size, seen.length);
  assert.ok(seen.includes("qa-item-withdrawn"));
  await page.goto(origin + "/admin/items");
  await loaded();
  assert.equal(await page.getByLabel("Review state").inputValue(), "all");
  assert.equal(await page.getByLabel("Visibility").inputValue(), "all");
  await shot("wall-1440");
  await page.goto(origin + "/admin/items?itemId=qa-item-available");
  await dialog.waitFor();
  await dialog
    .getByRole("button", { name: "Hide from Wall", exact: true })
    .waitFor();
  await dialog
    .getByRole("button", { name: "Hide from Wall", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Restore to Wall", exact: true })
    .waitFor();
  assert.equal((await read("wall/qa-item-available")).publicVisibility, false);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await dialog.waitFor({ state: "detached" });
  await page.getByLabel("Visibility").selectOption("hidden");

  await page
    .getByRole("button", {
      name: "View details: SYNTHETIC QA available",
      exact: true,
    })
    .click();
  await dialog
    .getByRole("button", { name: "Restore to Wall", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Hide from Wall", exact: true })
    .waitFor();
  const restored = await read("wall/qa-item-available");
  assert.equal(restored.publicVisibility, true);
  assert.equal(restored.publicStatus, "available");
  await shot("wall-detail-1440");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  await page.goto(origin + "/admin/donations?submissionId=qa-drop-multi_photo");
  await dialog.waitFor();
  await dialog
    .getByRole("heading", {
      name: "SYNTHETIC QA multi_photo",
      exact: true,
      level: 3,
    })
    .waitFor();
  assert.equal(await dialog.locator(".inventory-photos img").count(), 2);
  await shot("drop-detail-1440");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await loaded();
  await page.getByRole("heading", { name: "Give journey" }).waitFor();
  assert.ok(
    (await page
      .locator(".inventory-funnel")
      .getByText("Unavailable", { exact: true })
      .count()) >= 5,
  );
  await shot("drops-1440");
  await page.route("**/api/admin/control-center/drops?*", (route) =>
    route.fulfill({
      status: 503,
      body: '{"error":"Synthetic failure"}',
      contentType: "application/json",
    }),
  );
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page
    .getByText("Refresh failed · showing previous data", { exact: true })
    .waitFor();
  assert.ok((await page.locator(".inventory-row").count()) > 0);
  await page.unroute("**/api/admin/control-center/drops?*");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page
    .getByText("Refresh failed · showing previous data", { exact: true })
    .waitFor({ state: "hidden" });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of ["donations", "items"]) {
      await page.goto(origin + "/admin/" + route);
      await loaded();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await shot(`${route === "donations" ? "drops" : "wall"}-${width}`);
      await page.locator(".inventory-row").first().scrollIntoViewIfNeeded();
      await shot(
        `${route === "donations" ? "drops" : "wall"}-${width}-scrolled`,
      );
    }
  }
  await page.goto(origin + "/admin/items?itemId=qa-item-multi_photo");
  await dialog.waitFor();
  await dialog
    .getByRole("heading", {
      name: "SYNTHETIC QA multi_photo",
      exact: true,
      level: 3,
    })
    .waitFor();
  await shot("wall-detail-320");
  assert.ok(
    await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  );
  assert.deepEqual(unexpected, []);
  assert.deepEqual(errors, []);
  await writeFile(
    new URL("proof.json", output),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        checks: [
          "production preview",
          "JWT auth and query validation",
          "cursor traversal without duplicates",
          "All includes hidden/withdrawn",
          "deep links and linked photos",
          "emulator hide/unhide",
          "Escape closes drawer",
          "stale refresh and recovery",
          "desktop/mobile 1440/390/320",
          "no horizontal overflow",
        ],
        requests: requests.length,
        unexpected,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "Inventory browser QA passed:",
    requests.length,
    "local requests",
  );
} catch (error) {
  console.error("QA state", page.url(), await dialog.count());
  await shot("failure");
  throw error;
} finally {
  await browser.close();
}

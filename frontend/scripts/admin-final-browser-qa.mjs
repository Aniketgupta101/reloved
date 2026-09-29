import assert from "node:assert/strict";
import { chromium } from "playwright";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const origin = "http://127.0.0.1:3100";
const output = new URL("../qa-artifacts/admin-control-center/final/", import.meta.url);
await mkdir(output, { recursive: true });
const pages = [
  ["overview", "/admin", "Overview"],
  ["notifications", "/admin/notifications", "Needs attention"],
  ["drops", "/admin/donations", "Drops"],
  ["wall", "/admin/items", "Wall"],
  ["claims", "/admin/item-requests", "Claims"],
  ["deliveries", "/admin/orders", "Deliveries"],
  ["support", "/admin/messages", "Support"],
  ["analytics", "/admin/analytics", "Analytics"],
];
const external = [];
const errors = [];
const badResponses = [];
const browser = await chromium.launch({ headless: true, channel: "chrome" });

function observe(context, page) {
  context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      external.push(url.href);
      return route.abort();
    }
    return route.continue();
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400)
      badResponses.push(`${response.status()} ${response.url()}`);
  });
}

async function signIn(page) {
  await page.goto(origin + "/admin");
  await page.waitForFunction(
    () =>
      document.querySelector('input[type="email"]') ||
      document.querySelector('nav[aria-label="Admin navigation"]'),
  );
  if (await page.locator("input[type=email]").isVisible()) {
    await page.locator("input[type=email]").fill("admin@synthetic.invalid");
    await page.locator("input[type=password]").fill("synthetic-local-admin");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page
      .getByRole("navigation", { name: "Admin navigation", exact: true })
      .waitFor();
  }
}

async function waitForPage(page, heading) {
  await page.getByRole("heading", { name: heading, exact: true }).first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(100);
}

const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
observe(context, page);
await signIn(page);

for (const [name, path, heading] of pages) {
  await page.goto(origin + path);
  await waitForPage(page, heading);
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    true,
    `${name} has no page-level horizontal overflow at 1440`,
  );
  await page.screenshot({
    path: fileURLToPath(new URL(`${name}-1440.png`, output)),
    fullPage: true,
  });
}

await page.goto(origin + "/admin/donations");
await waitForPage(page, "Drops");
await page.getByRole("button", { name: /^View details:/ }).first().click();
const dialog = page.locator("dialog[open]");
await dialog.waitFor();
assert.equal(await dialog.getAttribute("aria-labelledby"), "inventory-detail-title");
await page.keyboard.press("Escape");
await dialog.waitFor({ state: "hidden" });

for (const width of [1280, 1024, 768, 390, 320]) {
  await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
  await page.goto(origin + "/admin");
  await waitForPage(page, "Overview");
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    true,
    `overview has no overflow at ${width}`,
  );
  const menu = page.locator(".admin-menu-toggle");
  if (await menu.isVisible()) {
    await menu.click();
    assert.equal(await menu.getAttribute("aria-expanded"), "true");
    await page.keyboard.press("Escape");
    assert.equal(await menu.getAttribute("aria-expanded"), "false");
    assert.equal(await menu.evaluate((element) => element === document.activeElement), true);
  }
  await page.screenshot({
    path: fileURLToPath(new URL(`overview-${width}.png`, output)),
    fullPage: width > 390,
  });
}

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(origin + "/admin/messages");
await waitForPage(page, "Support");
await page.evaluate(() => {
  document.documentElement.style.fontSize = "200%";
});
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2),
  true,
  "support remains usable under 200% text pressure",
);
await page.screenshot({
  path: fileURLToPath(new URL("support-390-text-200.png", output)),
});

await page.evaluate(() => {
  document.documentElement.style.fontSize = "";
  window.scrollTo(0, 0);
});
await page.keyboard.press("Tab");
assert.match(await page.locator(":focus").textContent(), /Skip to content/i);
await page.keyboard.press("Enter");
assert.equal(await page.locator("#admin-main").evaluate((element) => element === document.activeElement), true);

await context.close();

const videoContext = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  reducedMotion: "reduce",
  recordVideo: {
    dir: fileURLToPath(output),
    size: { width: 1280, height: 720 },
  },
});
const videoPage = await videoContext.newPage();
observe(videoContext, videoPage);
await signIn(videoPage);
for (const [, path, heading] of pages) {
  await videoPage.goto(origin + path);
  await waitForPage(videoPage, heading);
  await videoPage.waitForTimeout(550);
}
const video = videoPage.video();
await videoContext.close();
const videoPath = await video.path();
await copyFile(videoPath, fileURLToPath(new URL("admin-control-center-walkthrough.webm", output)));
await browser.close();

assert.deepEqual(external, []);
assert.deepEqual(errors, []);
assert.deepEqual(badResponses, []);
await writeFile(
  new URL("proof.json", output),
  JSON.stringify(
    {
      at: new Date().toISOString(),
      origin,
      pages: pages.map(([name]) => name),
      viewports: [1440, 1280, 1024, 768, 390, 320],
      textPressure: "200%",
      reducedMotion: true,
      keyboard: ["skip-link", "mobile-menu-escape-focus-return"],
      dialog: "native inventory detail opened and closed with Escape",
      externalRequests: external,
      pageErrors: errors,
      failedResponses: badResponses,
      video: "admin-control-center-walkthrough.webm",
    },
    null,
    2,
  ),
);
console.log("Final Admin Control Center browser proof passed.");

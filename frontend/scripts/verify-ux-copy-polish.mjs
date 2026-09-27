import assert from "node:assert/strict"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { chromium } from "playwright"

const baseUrl = process.env.UX_PREVIEW_URL || "http://127.0.0.1:3200"
const phase = process.env.UX_CAPTURE_PHASE || "after"
const artifactsDir = path.resolve("qa-artifacts", "ux-copy-polish", phase)
const selectedScenarios = new Set(
  String(process.env.UX_SCENARIOS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
)

await mkdir(artifactsDir, { recursive: true })

const browser = await chromium.launch({ channel: "chrome", headless: true })
const failures = []

async function runScenario(name, fn) {
  if (selectedScenarios.size > 0 && !selectedScenarios.has(name)) return
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url())
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.protocol === "data:") {
      await route.continue()
      return
    }
    await route.abort("blockedbyclient")
  })
  const page = await context.newPage()
  try {
    await fn({ context, page })
    console.log(`PASS ${name}`)
  } catch (error) {
    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`)
    console.error(`FAIL ${name}`)
  } finally {
    await page.screenshot({ path: path.join(artifactsDir, `${name}.png`), fullPage: true })
    await context.close()
  }
}

async function expectVisible(page, text) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout: 8_000 })
}

async function authenticate(context, draft) {
  await context.addInitScript((savedDraft) => {
    localStorage.setItem("reloved_donor_token", "local-test-token")
    if (savedDraft) localStorage.setItem("reloved_give_draft", JSON.stringify(savedDraft))
  }, draft)
}

async function mockProfile(page) {
  await page.route("**/api/donor/profile", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        profile: {
          onboardedAt: "2026-09-27T00:00:00.000Z",
          name: "Local Tester",
          username: "localtester",
          phone: "9000000001",
          email: "local@example.test",
          address: "Test Building, Bandra West 400050",
          pincode: "400050",
        },
      }),
    }),
  )
}

function giveDraft() {
  return {
    step: 7,
    uploadMode: "single",
    activeGroupId: 0,
    awaitingLogin: false,
    formData: {
      itemTitle: "Local test jacket",
      category: "Outerwear",
      gender: "unisex",
      description: "Local test item",
      condition: "Good",
      size: "M",
      quantity: 1,
      brand: "",
      age: "",
      defect: "",
      firstName: "Local",
      lastName: "Tester",
      phone: "9000000001",
      email: "local@example.test",
      contactMethod: "WhatsApp",
      recognitionPreference: "anonymous",
      aliasName: "",
      city: "Mumbai",
      pincode: "400050",
      pickupLocality: "Test Building, Bandra West 400050",
      dateRange: "Flexible",
      timeWindow: "Flexible",
      notes: "",
      declaration: true,
      acceptedTerms: true,
      giverLogistics: "porter_arranged",
      deliveryAddress: "",
      porterPaidBy: "receiver",
      latitude: null,
      longitude: null,
    },
    itemDrafts: {},
    photoItems: [
      {
        previewUrl:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=",
        status: "done",
        storagePath: "/local-test-photo.jpg",
        groupId: 0,
        fileName: "local-test-photo.jpg",
      },
    ],
  }
}

function bulkGiveDraft() {
  const draft = giveDraft()
  const photo = draft.photoItems[0]
  return {
    ...draft,
    uploadMode: "bulk",
    activeGroupId: 2,
    photoItems: [0, 1, 2].map((groupId) => ({
      ...photo,
      groupId,
      storagePath: `/local-test-photo-${groupId}.jpg`,
      fileName: `local-test-photo-${groupId}.jpg`,
    })),
    itemDrafts: Object.fromEntries(
      [0, 1, 2].map((groupId) => [
        groupId,
        {
          itemTitle: `Local test item ${groupId + 1}`,
          category: "Tops",
          gender: "unisex",
          description: "Local test item",
          condition: "Good",
          size: "M",
          brand: "",
          age: "",
          defect: "",
          quantity: 1,
        },
      ]),
    ),
  }
}

await runScenario("give-upload-error", async ({ context, page }) => {
  await authenticate(context, giveDraft())
  await mockProfile(page)
  await page.route("**/api/donations", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error:
          "Photo upload failed — your item needs at least one photo to appear on the Wall. Please try again with a clearer photo.",
      }),
    }),
  )
  await page.goto(`${baseUrl}/give`)
  await expectVisible(page, "Terms & submit")
  await page.getByRole("button", { name: /I Accept - Submit/i }).click()
  await expectVisible(page, "Photo wasn’t uploaded")
  await expectVisible(page, "We couldn’t upload your photo right now")
})

await runScenario("give-uncertain", async ({ context, page }) => {
  await authenticate(context, giveDraft())
  await mockProfile(page)
  await page.route("**/api/donations", (route) => route.abort("failed"))
  await page.goto(`${baseUrl}/give`)
  await page.getByRole("button", { name: /I Accept - Submit/i }).click()
  await expectVisible(page, "Drop status not confirmed")
  const recovery = page.locator('a[href="/account?tab=giving"]')
  await recovery.waitFor({ state: "visible" })
  assert.equal(await recovery.getAttribute("target"), "_blank")
})

await runScenario("give-normal-success", async ({ context, page }) => {
  await authenticate(context, giveDraft())
  await mockProfile(page)
  await page.route("**/api/donations", (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ reference: "RL-LOCAL-123", itemId: "item-1", imageProcessingStatus: "ready" }),
    }),
  )
  await page.goto(`${baseUrl}/give`)
  await page.getByRole("button", { name: /I Accept - Submit/i }).click()
  await page.waitForURL("**/give/success/RL-LOCAL-123**")
  await expectVisible(page, "Thank you for your drop")
  await expectVisible(page, "Your item was submitted")
  assert.equal(await page.getByText(/Your item is live/i).count(), 0)
  await page.locator('a[href="/account?tab=giving"]').waitFor({ state: "visible" })
})

await runScenario("give-partial-success", async ({ context, page }) => {
  await authenticate(context, bulkGiveDraft())
  await mockProfile(page)
  let requestCount = 0
  await page.route("**/api/donations", (route) => {
    requestCount += 1
    if (requestCount === 3) {
      void route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Photo upload failed" }),
      })
      return
    }
    void route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        reference: `RL-LOCAL-${requestCount}`,
        itemId: `item-${requestCount}`,
        imageProcessingStatus: "ready",
      }),
    })
  })
  await page.goto(`${baseUrl}/give`)
  await page.getByRole("button", { name: /I Accept - Submit/i }).click()
  await page.waitForURL("**/give/success/RL-LOCAL-2**")
  await expectVisible(page, "Some items were added")
  await expectVisible(page, "2 items were submitted")
  await expectVisible(page, "1 item wasn’t submitted")
  await page.reload()
  await expectVisible(page, "Some items were added")
})

await runScenario("claim-uncertain", async ({ context, page }) => {
  await authenticate(context)
  await mockProfile(page)
  await page.route("**/api/items/claimable", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        item: {
          id: "item-claimable",
          slug: "claimable",
          title: "Local test shirt",
          description: "Local test item",
          category: "Tops",
          condition: "Good",
          size: "M",
          quantity: 1,
          publicStatus: "available",
          publicVisibility: true,
          giverLogistics: "porter_arranged",
          images: [{ storagePath: "/local-test-photo.jpg" }],
        },
      }),
    }),
  )
  await page.route("**/api/donor/item-requests", async (route) => {
    if (route.request().method() === "POST") {
      await route.abort("failed")
      return
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ requests: [], weeklyUsed: 0, weeklyLimit: 2 }),
    })
  })
  await page.goto(`${baseUrl}/drop/claimable`)
  await page.getByRole("button", { name: "Claim this item" }).click()
  await page.getByRole("button", { name: "Continue" }).click()
  const checkboxes = page.getByRole("checkbox")
  for (let index = 0; index < (await checkboxes.count()); index += 1) {
    await checkboxes.nth(index).check()
  }
  await page.getByRole("button", { name: /Send request/i }).click()
  await expectVisible(page, "Claim status not confirmed")
  const recovery = page.locator('a[href="/account?tab=claiming"]')
  await recovery.waitFor({ state: "visible" })
  assert.equal(await recovery.getAttribute("target"), "_blank")
})

await runScenario("item-temporarily-unavailable", async ({ page }) => {
  await page.route("**/api/items/network-error", (route) => route.abort("failed"))
  await page.goto(`${baseUrl}/drop/network-error`)
  await expectVisible(page, "Couldn’t load this item")
  await expectVisible(page, "No changes were made")
})

await runScenario("delivery-failed", async ({ context, page }) => {
  await authenticate(context)
  await mockProfile(page)
  await page.route("**/api/donor/item-requests/claim-failed", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        request: {
          id: "claim-failed",
          status: "approved",
          handoverStage: "schedule_agreed",
          giverLogistics: "porter_arranged",
          deliveryStatus: "failed",
          createdAt: "2026-09-27T00:00:00.000Z",
          requesterAddress: "Test Building, Bandra West 400050",
          item: {
            id: "item-1",
            slug: "local-test-shirt",
            title: "Local test shirt",
            images: [{ storagePath: "/local-test-photo.jpg" }],
          },
        },
      }),
    }),
  )
  await page.goto(`${baseUrl}/account/claims/claim-failed`)
  await expectVisible(page, "Delivery needs attention")
  await expectVisible(page, "Use Reloved chat below")
})

await runScenario("missing-page", async ({ page }) => {
  await page.goto(`${baseUrl}/this-page-does-not-exist`)
  await expectVisible(page, "Page not found")
  await expectVisible(page, "Browse the Wall")
})

await browser.close()

if (failures.length > 0) {
  throw new Error(`UX verification failed:\n${failures.join("\n")}`)
}

console.log(`Captured screenshots in ${artifactsDir}`)

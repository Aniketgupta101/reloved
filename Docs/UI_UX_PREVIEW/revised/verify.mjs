import { chromium } from '../../../frontend/node_modules/playwright/index.mjs';
import { mkdir, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const folder = dirname(fileURLToPath(import.meta.url));
const url = 'http://127.0.0.1:3191/Docs/UI_UX_PREVIEW/';
const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
const outputs = [];
const failures = [];
for (const [screen, widths] of [
  ['Home', [390, 1440]], ['Wall', [390, 1440]], ['Item detail', [390, 1440]],
  ['Give', [390, 1440]], ['Account', [390, 1440]], ['Claim detail', [390, 1440]],
  ['Wall', [320, 768]], ['Give', [320, 768]],
]) {
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    const response = await page.goto(`${url}?screen=${encodeURIComponent(screen)}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(async () => {
      for (const image of document.images) image.loading = 'eager';
      await Promise.race([
        Promise.allSettled([...document.images].map(image => image.decode())),
        new Promise(resolve => setTimeout(resolve, 4000)),
      ]);
    });
    const facts = await page.evaluate(() => ({
      h1: document.querySelector('#customer h1')?.textContent,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      fonts: [...document.fonts].filter(font => ['Manrope', 'Bricolage Grotesque'].includes(font.family)).map(font => ({ family: font.family, status: font.status })),
      missingImages: [...document.images].filter(image => !image.complete || image.naturalWidth === 0).map(image => image.src),
      progress: [...document.querySelectorAll('.give-progress .step')].map(el => ({ right: el.getBoundingClientRect().right, width: el.getBoundingClientRect().width })),
    }));
    const file = join(folder, `${screen.toLowerCase().replace(/ /g, '-')}-${width}.png`);
    await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
    outputs.push({ screen, width, status: response.status(), ...facts, errors, file });
    if (response.status() !== 200 || facts.horizontalOverflow || errors.length || facts.missingImages.length || facts.fonts.some(font => font.status !== 'loaded')) failures.push({ screen, width, facts, errors });
    await page.close();
  }
}

const page = await browser.newPage({ viewport: { width: 390, height: 844 }, recordVideo: { dir: folder, size: { width: 390, height: 844 } } });
await page.goto(`${url}?screen=Home`, { waitUntil: 'networkidle' });
await page.waitForTimeout(450);
await page.getByRole('button', { name: 'Open menu' }).click();
await page.waitForTimeout(450);
await page.getByRole('button', { name: 'Wall of Kindness', exact: true }).click();
await page.waitForTimeout(350);
await page.getByRole('button', { name: 'Filter', exact: true }).click();
await page.waitForTimeout(400);
await page.selectOption('.sheet [data-filter-type="filter"]', 'Tops');
await page.waitForTimeout(350);
await page.locator('.product-card').first().click();
await page.waitForTimeout(350);
await page.getByRole('button', { name: 'Show back photo' }).click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Open menu' }).click();
await page.getByRole('button', { name: 'Drop an item', exact: true }).click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'Continue to details' }).click();
await page.waitForTimeout(550);
await page.close();
const video = page.video();
if (video) await rename(await video.path(), join(folder, 'interaction-review.webm'));
await browser.close();
console.log(JSON.stringify({ outputs, failures, recording: join(folder, 'interaction-review.webm') }, null, 2));
if (failures.length) process.exitCode = 1;

#!/usr/bin/env node
// Captures full-page screenshots across a matrix of desktop/mobile viewports
// and runs automated checks (overflow, tap targets, tiny text, distorted
// images) that are objective enough to script. Visual judgment (overlap,
// crowding, contrast, "does this look good") is left to the screenshots
// themselves — a human or Claude reviews those separately.
//
// Usage:
//   node capture_viewports.mjs --url http://localhost:3000 --routes /,/browse,/checkout --out audit-out
//
// Requires the `playwright` package, already a devDependency of this repo's
// frontend (frontend/package.json). Run from the frontend/ directory, or
// pass --cwd to point at it.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// Resolve `playwright` from the CALLER's cwd (e.g. frontend/), not from this
// script's own directory — the script lives under .claude/skills/, outside
// any node_modules tree, so a plain `import 'playwright'` fails even when
// invoked from a directory where it's installed.
const require = createRequire(path.join(process.cwd(), 'package.json'));
const playwrightEntry = require.resolve('playwright');
const playwrightModule = await import(pathToFileURL(playwrightEntry).href);
const chromium = playwrightModule.chromium ?? playwrightModule.default.chromium;

function parseArgs(argv) {
  const args = { url: 'http://localhost:3000', routes: '/', out: 'audit-out' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') args.url = argv[++i];
    else if (a === '--routes') args.routes = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--viewports') args.viewportsFilter = argv[++i];
  }
  return args;
}

// width x height, label, category. Heights chosen to match real device
// aspect ratios rather than arbitrary numbers, since a viewport that's the
// right width but wrong height hides scroll-position and safe-area bugs.
const VIEWPORTS = [
  // Mobile portrait
  { name: 'mobile-320-iphonese1', width: 320, height: 568, category: 'mobile-portrait' },
  { name: 'mobile-375-iphonese3', width: 375, height: 667, category: 'mobile-portrait' },
  { name: 'mobile-390-iphone12', width: 390, height: 844, category: 'mobile-portrait' },
  { name: 'mobile-414-iphoneplus', width: 414, height: 896, category: 'mobile-portrait' },
  { name: 'mobile-360-android', width: 360, height: 800, category: 'mobile-portrait' },
  { name: 'mobile-412-pixel', width: 412, height: 915, category: 'mobile-portrait' },
  // Mobile landscape (rotated) — many apps break here first
  { name: 'mobile-667-iphonese3-landscape', width: 667, height: 375, category: 'mobile-landscape' },
  { name: 'mobile-844-iphone12-landscape', width: 844, height: 390, category: 'mobile-landscape' },
  // Tablet
  { name: 'tablet-768-ipad-portrait', width: 768, height: 1024, category: 'tablet' },
  { name: 'tablet-1024-ipad-landscape', width: 1024, height: 768, category: 'tablet' },
  { name: 'tablet-820-ipadair-portrait', width: 820, height: 1180, category: 'tablet' },
  // Desktop
  { name: 'desktop-1024', width: 1024, height: 768, category: 'desktop' },
  { name: 'desktop-1280', width: 1280, height: 800, category: 'desktop' },
  { name: 'desktop-1440', width: 1440, height: 900, category: 'desktop' },
  { name: 'desktop-1920', width: 1920, height: 1080, category: 'desktop' },
  // Ultra-wide / small laptop edge cases
  { name: 'laptop-1366', width: 1366, height: 768, category: 'desktop' },
];

const CHECK_SCRIPT = () => {
  const results = { horizontalOverflow: null, tinyTapTargets: [], tinyText: [], distortedImages: [], fixedOverlapRisk: [] };

  const doc = document.documentElement;
  const overflowPx = doc.scrollWidth - doc.clientWidth;
  results.horizontalOverflow = overflowPx > 1 ? overflowPx : null;

  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const style = getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) !== 0;
  };

  // Tap target size — WCAG 2.5.5 / iOS HIG recommend >=44x44 CSS px for
  // anything a finger has to hit.
  document.querySelectorAll('a[href], button, [role="button"], input[type="checkbox"], input[type="radio"], select, summary').forEach((el) => {
    if (!isVisible(el)) return;
    const r = el.getBoundingClientRect();
    if (r.width < 44 || r.height < 44) {
      results.tinyTapTargets.push({
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40),
        width: Math.round(r.width),
        height: Math.round(r.height),
        selector: cssPath(el),
      });
    }
  });

  // Tiny body text — under 12px is generally unreadable on mobile.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.textContent.trim().length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const seen = new Set();
  let node;
  while ((node = walker.nextNode())) {
    const el = node.parentElement;
    if (!el || seen.has(el) || !isVisible(el)) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < 12) {
      seen.add(el);
      results.tinyText.push({ tag: el.tagName.toLowerCase(), fontSize: size, text: node.textContent.trim().slice(0, 40), selector: cssPath(el) });
    }
  }

  // Images stretched/squashed relative to their natural aspect ratio,
  // usually from a missing object-fit or a hardcoded width/height.
  document.querySelectorAll('img').forEach((img) => {
    if (!isVisible(img) || !img.naturalWidth || !img.naturalHeight) return;
    const natural = img.naturalWidth / img.naturalHeight;
    const rendered = img.clientWidth / img.clientHeight;
    const diff = Math.abs(natural - rendered) / natural;
    const objectFit = getComputedStyle(img).objectFit;
    if (diff > 0.15 && objectFit !== 'cover' && objectFit !== 'contain') {
      results.distortedImages.push({
        src: img.currentSrc || img.src,
        naturalRatio: Number(natural.toFixed(2)),
        renderedRatio: Number(rendered.toFixed(2)),
        objectFit,
        selector: cssPath(img),
      });
    }
  });

  // Fixed/sticky elements near the viewport edges are the usual suspects
  // for safe-area and notch collisions — flag them so a human checks the
  // screenshot at that spot.
  document.querySelectorAll('*').forEach((el) => {
    const style = getComputedStyle(el);
    if ((style.position === 'fixed' || style.position === 'sticky') && isVisible(el)) {
      const r = el.getBoundingClientRect();
      const nearTop = r.top < 20;
      const nearBottom = window.innerHeight - r.bottom < 20;
      if (nearTop || nearBottom) {
        results.fixedOverlapRisk.push({ tag: el.tagName.toLowerCase(), position: style.position, edge: nearTop ? 'top' : 'bottom', selector: cssPath(el) });
      }
    }
  });

  function cssPath(el) {
    if (el.id) return `#${el.id}`;
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && parts.length < 4) {
      let sel = cur.tagName.toLowerCase();
      if (cur.className && typeof cur.className === 'string') {
        const cls = cur.className.trim().split(/\s+/).slice(0, 2).join('.');
        if (cls) sel += `.${cls}`;
      }
      parts.unshift(sel);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  }

  return results;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const routes = args.routes.split(',').map((r) => r.trim()).filter(Boolean);
  const viewports = args.viewportsFilter
    ? VIEWPORTS.filter((v) => args.viewportsFilter.split(',').includes(v.name))
    : VIEWPORTS;

  await mkdir(args.out, { recursive: true });

  const browser = await chromium.launch();
  const report = { url: args.url, generatedAt: new Date().toISOString(), routes: {} };

  for (const route of routes) {
    const routeKey = route === '/' ? 'root' : route.replace(/^\//, '').replace(/\//g, '_');
    report.routes[route] = [];
    for (const vp of viewports) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      const target = new URL(route, args.url).toString();
      try {
        await page.goto(target, { waitUntil: 'networkidle', timeout: 20000 });
        await page.waitForTimeout(300); // settle animations/fonts
        const checks = await page.evaluate(CHECK_SCRIPT);
        const shotName = `${routeKey}__${vp.name}.png`;
        await page.screenshot({ path: path.join(args.out, shotName), fullPage: true });
        report.routes[route].push({ viewport: vp, screenshot: shotName, checks });
        const issueCount = checks.tinyTapTargets.length + checks.tinyText.length + checks.distortedImages.length + (checks.horizontalOverflow ? 1 : 0);
        console.log(`[${vp.category}] ${vp.name} (${vp.width}x${vp.height}) ${route} -> ${issueCount} auto-flagged issue(s)`);
      } catch (err) {
        report.routes[route].push({ viewport: vp, error: String(err) });
        console.error(`[${vp.category}] ${vp.name} ${route} -> ERROR: ${err.message}`);
      } finally {
        await context.close();
      }
    }
  }

  await browser.close();
  const reportPath = path.join(args.out, 'report.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nScreenshots + report.json written to ${args.out}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

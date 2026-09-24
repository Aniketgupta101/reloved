#!/usr/bin/env node
// Renders Docs/RELOVED_PATCH_NOTES.md as a polished, client-shareable PDF.
// Parses the doc's own simple structure (## headers, bold intro lines, plain
// paragraphs, "- <icon> text" bullets) rather than pulling in a full
// markdown engine — the source format is consistent enough that a small
// hand-rolled parser stays accurate and is easy to re-run whenever the doc
// updates.
//
// Usage (from frontend/):
//   node scripts/render-patch-notes-pdf.mjs \
//     --in ../Docs/RELOVED_PATCH_NOTES.md \
//     --out ../Docs/RELOVED_PATCH_NOTES.pdf

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(path.join(process.cwd(), 'package.json'))
const playwrightEntry = require.resolve('playwright')
const playwrightModule = await import(pathToFileURL(playwrightEntry).href)
const chromium = playwrightModule.chromium ?? playwrightModule.default.chromium

function parseArgs(argv) {
  const args = { in: '../Docs/RELOVED_PATCH_NOTES.md', out: '../Docs/RELOVED_PATCH_NOTES.pdf' }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--in') args.in = argv[++i]
    else if (argv[i] === '--out') args.out = argv[++i]
  }
  return args
}

const ICON_META = {
  '✅': { cls: 'done', label: 'Fixed & Live' },
  '⚠️': { cls: 'open', label: 'In Progress' },
  '🔜': { cls: 'queued', label: 'Queued Next' },
  '📌': { cls: 'phase2', label: 'Phase 2' },
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Minimal inline markdown: **bold**, *italic*, `code`, already-escaped text in.
function inline(md) {
  let s = escapeHtml(md)
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
  return s
}

function parseBullet(line) {
  const m = line.match(/^-\s+(✅|⚠️|🔜|📌)\s+(.*)$/u)
  if (!m) return { html: `<li>${inline(line.replace(/^-\s+/, ''))}</li>`, cls: null }
  const [, icon, rest] = m
  const meta = ICON_META[icon]
  return {
    html: `<li class="bullet"><span class="badge ${meta.cls}">${meta.label}</span><span class="bullet-text">${inline(rest)}</span></li>`,
    cls: meta.cls,
  }
}

function parseMarkdown(md) {
  const lines = md.split(/\r?\n/)
  const blocks = []
  let i = 0

  // Title (# ...)
  while (i < lines.length && !lines[i].trim()) i++
  const titleMatch = lines[i]?.match(/^#\s+(.*)$/)
  const title = titleMatch ? titleMatch[1].replace(/^RELOVED\s*[—-]\s*/, '') : 'Patch Notes'
  if (titleMatch) i++

  let currentList = null
  const flushList = () => {
    if (currentList) {
      blocks.push({ type: 'list', items: currentList })
      currentList = null
    }
  }

  for (; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) continue
    if (trimmed === '---') {
      flushList()
      continue
    }
    if (trimmed.startsWith('## ')) {
      flushList()
      const text = trimmed.slice(3)
      blocks.push({ type: 'h2', text, isStatus: !/^\d/.test(text) })
      continue
    }
    if (trimmed.startsWith('**Legend:**')) {
      flushList()
      blocks.push({ type: 'legend', text: trimmed.replace(/^\*\*Legend:\*\*\s*/, '') })
      continue
    }
    if (/^\*\*Hi Sheetal/.test(trimmed)) {
      flushList()
      blocks.push({ type: 'greeting', text: trimmed.replace(/\*\*/g, '') })
      continue
    }
    if (trimmed.startsWith('- ')) {
      const parsed = parseBullet(trimmed)
      currentList = currentList || []
      currentList.push(parsed)
      continue
    }
    if (trimmed.startsWith('*') && trimmed.endsWith('*') && !trimmed.startsWith('**')) {
      flushList()
      blocks.push({ type: 'footer', text: trimmed.slice(1, -1) })
      continue
    }
    // Plain paragraph
    flushList()
    blocks.push({ type: 'p', text: trimmed })
  }
  flushList()

  return { title, blocks }
}

const STAT_LABELS = {
  done: 'Fixed & Live',
  open: 'In Progress',
  queued: 'Queued Next',
  phase2: 'Phase 2',
}
const STAT_ORDER = ['done', 'open', 'queued', 'phase2']

function render({ title, blocks }) {
  const dateMatch = blocks.find((b) => b.type === 'footer')?.text.match(/Last updated ([^.]+)\./)
  const lastUpdated = dateMatch ? dateMatch[1] : ''

  // Prepass: tally every status badge across the whole doc for the summary bar.
  const counts = { done: 0, open: 0, queued: 0, phase2: 0 }
  for (const b of blocks) {
    if (b.type !== 'list') continue
    for (const item of b.items) {
      if (item.cls) counts[item.cls] += 1
    }
  }
  const totalTracked = STAT_ORDER.reduce((sum, k) => sum + counts[k], 0)
  const donePct = totalTracked ? Math.round((counts.done / totalTracked) * 100) : 0

  const statBarHtml = `
    <div class="stat-bar">
      <div class="stat-bar-head">
        <span class="stat-bar-title">Overall progress</span>
        <span class="stat-bar-pct">${donePct}% shipped &amp; live</span>
      </div>
      <div class="stat-track">
        ${STAT_ORDER.map((k) => {
          const pct = totalTracked ? (counts[k] / totalTracked) * 100 : 0
          return pct > 0 ? `<div class="stat-seg ${k}" style="width:${pct.toFixed(2)}%"></div>` : ''
        }).join('')}
      </div>
      <div class="stat-cards">
        ${STAT_ORDER.map(
          (k) => `<div class="stat-card ${k}"><div class="stat-num">${counts[k]}</div><div class="stat-lbl">${STAT_LABELS[k]}</div></div>`
        ).join('')}
      </div>
    </div>`

  let body = ''
  let statusSectionOpened = false
  for (const b of blocks) {
    if (b.type === 'greeting') {
      body += `<p class="greeting">${inline(b.text)}</p>`
    } else if (b.type === 'legend') {
      const chips = b.text
        .split('·')
        .map((part) => {
          const m = part.trim().match(/^(✅|⚠️|🔜|📌)\s*(.*)$/u)
          if (!m) return ''
          const meta = ICON_META[m[1]]
          return `<span class="badge ${meta.cls}">${escapeHtml(m[2])}</span>`
        })
        .join(' ')
      body += `<div class="legend">${chips}</div>`
      body += statBarHtml
    } else if (b.type === 'h2') {
      if (b.isStatus) {
        if (!statusSectionOpened) {
          body += `<div class="status-divider"><span>Current Status</span></div>`
          statusSectionOpened = true
        }
        const [namePart, ...rest] = b.text.split(' — ')
        body += `<h2 class="status-banner"><span class="title-text">${escapeHtml(namePart)}</span>${rest.length ? `<span class="status-sub">${escapeHtml(rest.join(' — '))}</span>` : ''}</h2>`
      } else {
        const [datePart, ...rest] = b.text.split(' — ')
        body += `<h2><span class="date">${escapeHtml(datePart)}</span>${rest.length ? `<span class="title-sep">—</span><span class="title-text">${escapeHtml(rest.join(' — '))}</span>` : ''}</h2>`
      }
    } else if (b.type === 'p') {
      body += `<p>${inline(b.text)}</p>`
    } else if (b.type === 'list') {
      body += `<ul>${b.items.map((it) => it.html).join('')}</ul>`
    } else if (b.type === 'footer') {
      body += `<p class="closing">${inline(b.text)}</p>`
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    color: #1a1a1a;
    font-size: 10.5pt;
    line-height: 1.55;
    background: #fff;
  }
  .cover {
    padding: 56px 56px 40px 56px;
    background: #0a0a0a;
    color: #fff;
  }
  .cover .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 30px;
  }
  .cover .brand-mark {
    width: 34px; height: 34px; border-radius: 50%;
    background: conic-gradient(from 180deg, #ff2e8b, #a6e639, #ff2e8b);
    flex-shrink: 0;
  }
  .cover .brand-name {
    font-size: 15pt;
    font-weight: 800;
    letter-spacing: 0.08em;
  }
  .cover h1 {
    font-size: 26pt;
    font-weight: 800;
    margin: 0 0 8px 0;
    letter-spacing: -0.01em;
  }
  .cover .subtitle {
    color: #cfcfcf;
    font-size: 11pt;
    margin: 0 0 26px 0;
  }
  .cover .meta-row {
    display: flex; gap: 28px; flex-wrap: wrap;
  }
  .cover .meta-item .label {
    text-transform: uppercase; letter-spacing: 0.08em; font-size: 7.5pt; color: #999; font-weight: 700;
  }
  .cover .meta-item .value {
    font-size: 10.5pt; color: #fff; margin-top: 3px; font-weight: 600;
  }

  .content { padding: 34px 56px 56px 56px; }

  .greeting { font-size: 11pt; font-weight: 700; margin: 0 0 10px 0; }
  p { margin: 0 0 14px 0; color: #2a2a2a; }

  .legend {
    display: flex; flex-wrap: wrap; gap: 8px;
    margin: 4px 0 16px 0;
    padding: 12px 14px;
    background: #f7f6f4;
    border: 1px solid #eae8e4;
    border-radius: 8px;
  }

  .stat-bar {
    margin: 0 0 30px 0;
    padding: 16px 18px;
    border: 1.5px solid #111;
    border-radius: 10px;
    background: #fafaf9;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .stat-bar-head {
    display: flex; justify-content: space-between; align-items: baseline;
    margin-bottom: 9px;
  }
  .stat-bar-title { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.07em; font-weight: 800; color: #555; }
  .stat-bar-pct { font-size: 11pt; font-weight: 800; color: #111; }
  .stat-track {
    display: flex; width: 100%; height: 9px;
    border-radius: 5px; overflow: hidden;
    background: #ece9e4; margin-bottom: 14px;
  }
  .stat-seg.done   { background: #2fa35b; }
  .stat-seg.open   { background: #e6a530; }
  .stat-seg.queued { background: #3b6fd6; }
  .stat-seg.phase2 { background: #9350d8; }
  .stat-cards {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;
  }
  .stat-card {
    text-align: center;
    padding: 8px 4px;
    border-radius: 7px;
    background: #fff;
    border: 1px solid #eae8e4;
  }
  .stat-num { font-size: 15pt; font-weight: 800; line-height: 1.1; }
  .stat-lbl { font-size: 6.8pt; text-transform: uppercase; letter-spacing: 0.03em; font-weight: 700; color: #666; margin-top: 2px; }
  .stat-card.done .stat-num   { color: #1b7a3d; }
  .stat-card.open .stat-num   { color: #9a5b00; }
  .stat-card.queued .stat-num { color: #1a4fa0; }
  .stat-card.phase2 .stat-num { color: #6b21a8; }

  .status-divider {
    display: flex; align-items: center; gap: 12px;
    margin: 26px 0 4px 0;
  }
  .status-divider::before, .status-divider::after {
    content: ''; flex: 1; height: 1px; background: #ddd9d2;
  }
  .status-divider span {
    font-size: 8pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em;
    color: #b23a7a;
  }

  h2 {
    font-size: 12.5pt;
    font-weight: 800;
    margin: 30px 0 10px 0;
    padding-top: 20px;
    border-top: 2px solid #111;
    page-break-inside: avoid;
    break-inside: avoid;
    page-break-after: avoid;
  }
  h2 .date {
    display: inline-block;
    background: #111;
    color: #fff;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 9pt;
    letter-spacing: 0.03em;
    margin-right: 8px;
    vertical-align: middle;
  }
  h2 .title-sep { color: #bbb; margin: 0 6px; }
  h2 .title-text { vertical-align: middle; }

  h2.status-banner {
    border-top: none;
    padding: 14px 16px;
    margin: 0 0 14px 0;
    background: #fdf1f7;
    border: 1.5px solid #f4c6dd;
    border-radius: 8px;
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  h2.status-banner .title-text { font-size: 12.5pt; color: #8a1f56; }
  h2.status-banner .status-sub { font-size: 9pt; font-weight: 600; color: #b0669a; }

  ul { list-style: none; margin: 0 0 18px 0; padding: 0; }
  li.bullet {
    display: grid;
    grid-template-columns: 88px 1fr;
    column-gap: 12px;
    align-items: baseline;
    padding: 5px 0;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  li:not(.bullet) { padding: 4px 0 4px 16px; position: relative; }
  li:not(.bullet)::before { content: '•'; position: absolute; left: 0; color: #999; }

  .bullet-text { color: #1f1f1f; }
  .bullet-text strong { color: #000; }

  .badge {
    justify-self: start;
    display: inline-block;
    font-size: 6.6pt;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    padding: 2.5px 7px;
    border-radius: 20px;
    white-space: nowrap;
    line-height: 1.5;
  }
  .badge.done   { background: #e3f6e8; color: #1b7a3d; border: 1px solid #bfe8cb; }
  .badge.open   { background: #fff3e0; color: #9a5b00; border: 1px solid #f5d9a8; }
  .badge.queued { background: #e8f0fe; color: #1a4fa0; border: 1px solid #c6d8f7; }
  .badge.phase2 { background: #f1eafc; color: #6b21a8; border: 1px solid #ddc9f5; }

  .closing {
    margin-top: 16px;
    padding-top: 14px;
    border-top: 1px solid #e5e3df;
    font-style: italic;
    color: #666;
    font-size: 9.5pt;
  }

  code {
    background: #f1f0ed; padding: 1px 5px; border-radius: 4px; font-size: 9pt;
    font-family: 'SF Mono', Consolas, monospace;
  }

  strong { font-weight: 700; }
</style>
</head>
<body>
  <div class="cover">
    <div class="brand">
      <div class="brand-mark"></div>
      <div class="brand-name">RELOVED</div>
    </div>
    <h1>${escapeHtml(title)}</h1>
    <p class="subtitle">A running log of client feedback and what shipped in response.</p>
    <div class="meta-row">
      <div class="meta-item"><div class="label">Prepared by</div><div class="value">Aniket Gupta</div></div>
      <div class="meta-item"><div class="label">Prepared for</div><div class="value">Sheetal Ahuja · Totem Interactive</div></div>
      <div class="meta-item"><div class="label">Covers</div><div class="value">21 Aug – 22 Sep 2026</div></div>
      <div class="meta-item"><div class="label">Last updated</div><div class="value">${escapeHtml(lastUpdated || '22 September 2026')}</div></div>
    </div>
  </div>
  <div class="content">
    ${body}
  </div>
</body>
</html>`
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const md = await readFile(path.resolve(process.cwd(), args.in), 'utf8')
  const parsed = parseMarkdown(md)
  const html = render(parsed)

  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'networkidle' })
  const outPath = path.resolve(process.cwd(), args.out)
  await page.pdf({
    path: outPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '0', bottom: '64px', left: '0', right: '0' },
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: `
      <div style="width:100%; font-family: Helvetica, Arial, sans-serif; font-size:7.5pt; color:#9a9a9a; padding:0 56px; display:flex; justify-content:space-between; align-items:center;">
        <span>RELOVED &middot; Patch Notes</span>
        <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
      </div>`,
  })
  await browser.close()
  console.log(`Wrote ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

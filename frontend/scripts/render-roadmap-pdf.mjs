#!/usr/bin/env node
// Renders Docs/RELOVED_PROJECT_ROADMAP_FINAL.md as a polished, client-shareable
// PDF with a visual Gantt chart. The Gantt rows are hand-authored here (not
// parsed from the markdown) because the timeline needs real proportional bars;
// the markdown stays the editable source of truth for the written content and
// carries the Gantt as a plain status table for anyone reading it on GitHub.
//
// Usage (from frontend/):
//   node scripts/render-roadmap-pdf.mjs \
//     --out ../Docs/RELOVED_PROJECT_ROADMAP_FINAL.pdf

import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(path.join(process.cwd(), 'package.json'))
const playwrightEntry = require.resolve('playwright')
const playwrightModule = await import(pathToFileURL(playwrightEntry).href)
const chromium = playwrightModule.chromium ?? playwrightModule.default.chromium

function parseArgs(argv) {
  const args = { out: '../Docs/RELOVED_PROJECT_ROADMAP_FINAL.pdf' }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') args.out = argv[++i]
  }
  return args
}

// 7 working weeks (21 Aug – 3 Oct 2026) as fractional columns, plus a
// dedicated "Phase 2" column for pending/future work.
const WEEKS = [
  { label: 'W1', sub: '21–27 Aug' },
  { label: 'W2', sub: '28 Aug–3 Sep' },
  { label: 'W3', sub: '4–10 Sep' },
  { label: 'W4', sub: '11–17 Sep' },
  { label: 'W5', sub: '18–24 Sep' },
  { label: 'W6', sub: '25 Sep–1 Oct' },
  { label: 'W7', sub: '2–3 Oct' },
]
const PHASE2_COL = { label: 'Phase 2', sub: 'Pending' }

// start/end are 1-indexed week numbers (inclusive). status: done | progress
const GANTT_ROWS = [
  { name: 'Foundation & brand', note: 'Homepage, Wall, OTP auth', start: 1, end: 1, status: 'done' },
  { name: 'Give & Claim core flow + email', note: 'End-to-end donate/claim, notifications', start: 2, end: 3, status: 'done' },
  { name: 'Privacy & handover logistics', note: 'Building-gate protocol', start: 3, end: 4, status: 'done' },
  { name: 'Matching, notification copy, onboarding', note: '3km radius, exact client copy', start: 4, end: 4, status: 'done' },
  { name: 'Live Friends & Family testing', note: 'Real-user bug blitz', start: 5, end: 5, status: 'done' },
  { name: 'Photo AI rebuild & multi-item drop', note: 'Speed + item1/item2/item3 flow', start: 5, end: 6, status: 'done' },
  { name: 'Mobile polish & public launch', note: 'reloved.digital goes live', start: 6, end: 6, status: 'done' },
  { name: 'Admin Control Center rebuild', note: '8 modules, 65/65 backend tests', start: 6, end: 7, status: 'done' },
  { name: 'PostHog analytics integration', note: 'Product funnels, overview KPIs', start: 6, end: 7, status: 'done' },
  { name: 'Security & concurrency hardening', note: 'Race-condition + idempotency audit', start: 6, end: 7, status: 'done' },
  { name: 'Multi-courier booking + live tracking', note: 'Borzo / Shadowfax / Shiprocket', start: 7, end: 7, status: 'done' },
  { name: 'Schedule confirm, 15km radius, FREE badges', note: 'Most recent ship — 3 Oct', start: 7, end: 7, status: 'done' },
  { name: 'Scalability Phase 0 hotfix', note: 'Timeouts, polling, health checks', start: 7, end: 8, status: 'progress' },
  { name: 'Branded SMS sender ID — full approval', note: '5 of N templates live, rest w/ carrier', start: 6, end: 8, status: 'progress' },
  { name: 'Edesy call-masking full automation', note: 'Vendor KYC + number provisioning', start: 3, end: 8, status: 'progress' },
  { name: 'Load testing (1,000+ concurrent)', note: 'Needs Phase 0 complete first', start: 8, end: 8, status: 'notstarted' },
  { name: 'Partner/NGO bulk-match workflow', note: 'Scoping + build still ahead', start: 8, end: 8, status: 'notstarted' },
  { name: 'Deep dual-courier status sync', note: 'Cross-provider auto-reconciliation', start: 8, end: 8, status: 'notstarted' },
]

const TOTAL_COLS = WEEKS.length + 1 // + Phase 2 column
const STATUS_META = {
  done: { color: '#2fa35b', label: 'Shipped & live' },
  progress: { color: '#e6a530', label: 'In progress' },
  notstarted: { color: '#b23a7a', label: 'Not started' },
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function renderGanttHtml() {
  const colWidth = 100 / TOTAL_COLS
  const header = WEEKS.map(
    (w) => `<div class="gantt-col-head"><div class="w">${w.label}</div><div class="d">${w.sub}</div></div>`
  ).join('') + `<div class="gantt-col-head phase2"><div class="w">${PHASE2_COL.label}</div><div class="d">${PHASE2_COL.sub}</div></div>`

  const rows = GANTT_ROWS.map((row) => {
    const left = (row.start - 1) * colWidth
    const width = (row.end - row.start + 1) * colWidth
    const meta = STATUS_META[row.status]
    return `
    <div class="gantt-row">
      <div class="gantt-label">
        <div class="name">${escapeHtml(row.name)}</div>
        <div class="note">${escapeHtml(row.note)}</div>
      </div>
      <div class="gantt-track">
        ${WEEKS.map((_, i) => `<div class="gridline" style="left:${(i * colWidth).toFixed(3)}%"></div>`).join('')}
        <div class="gridline" style="left:${(WEEKS.length * colWidth).toFixed(3)}%"></div>
        <div class="gantt-bar ${row.status}" style="left:${left.toFixed(3)}%; width:${width.toFixed(3)}%; background:${meta.color}"></div>
      </div>
    </div>`
  }).join('')

  const legend = Object.entries(STATUS_META)
    .map(([k, m]) => `<span class="legend-item"><span class="dot" style="background:${m.color}"></span>${m.label}</span>`)
    .join('')

  return `
  <div class="gantt">
    <div class="gantt-head-row">
      <div class="gantt-label-head">Workstream</div>
      <div class="gantt-cols">${header}</div>
    </div>
    ${rows}
    <div class="gantt-legend">${legend}</div>
  </div>`
}

const EXEC_SUMMARY_HTML = `
  <p>Reloved went from a blank repo to a live, publicly-used donation platform at <strong>reloved.digital</strong> in six weeks. The build ran in two halves:</p>
  <ol>
    <li><strong>21 Aug &ndash; 26 Sep: Product build-out and live Friends &amp; Family testing.</strong> Homepage, Wall of Kindness, Give/Claim flows, email + SMS notifications, privacy/handover logistics, AI photo processing, and real-user QA drove the bulk of the feature work and bug-fixing.</li>
    <li><strong>27 Sep &ndash; 3 Oct: Admin Control Center rebuild, security/scale hardening, multi-courier booking, and final feature polish.</strong> The admin side was rebuilt into one operational surface backed by a production PostHog analytics integration; a security/concurrency audit closed race-condition and data-exposure gaps; Borzo/Shadowfax/Shiprocket booking was wired into Admin. The most recent ship (3 Oct) added donor-side instant schedule confirmation, widened the matching radius from 3km to 15km, and added FREE badges on item pages.</li>
  </ol>
  <table class="kv-table">
    <tr><td>Live production site</td><td>reloved.digital (Firebase Hosting + Cloud Functions, asia-south1)</td></tr>
    <tr><td>Core user journey</td><td>Donate &rarr; AI photo processing &rarr; publish to Wall &rarr; claim &rarr; courier pickup/delivery &rarr; confirmation &mdash; fully built, tested, and live</td></tr>
    <tr><td>Admin Control Center</td><td>Rebuilt end-to-end; released 30 Sep with 28/28 UI tests, 32/32 live-safety tests, 65/65 backend tests passing</td></tr>
    <tr><td>Tracked feature checklist</td><td>34 done &middot; 2 in progress &middot; 1 not started</td></tr>
    <tr><td>Biggest external blocker</td><td>Edesy call-masking automation and remaining MSG91 SMS template approvals &mdash; both sitting in third-party vendor queues</td></tr>
  </table>
  <p class="note">Nothing in this document is new work introduced here &mdash; every line ships from a dated commit or a client-facing note already sent. This document's job is to put the whole timeline, and what's left, in one place.</p>
`

const PENDING_ROWS = [
  ['Edesy call-masking, full automation', 'In progress', 'KYC submitted 8&ndash;10 Sep; number provisioning is a vendor-side queue', 'Edesy (external)'],
  ['Branded SMS sender ID &mdash; remaining DLT templates', 'In progress', '5 of the active-flow templates are live and verified; the rest are in carrier approval', 'MSG91/DLT carrier (external)'],
  ['Scalability Phase 0 hotfix &mdash; full execution', 'In progress', 'Plan is scoped; some hotfixes shipped (PostHog timeouts, read-budget increases); full rollout (vendor-call timeouts everywhere, visibility-aware polling) still ahead', 'Engineering time'],
  ['Load testing &amp; 1,000+ concurrent-user verification', 'Not started', 'Needs Phase 0 hotfixes to land first, otherwise the test just measures known problems', 'Phase 0 completion'],
  ['Direct-to-storage photo uploads', 'Not started', 'Uploads proxy through the function today; fine at current volume, a scale item for headroom', 'Engineering time'],
  ['Deep dual-courier integration (auto status sync)', 'Not started', 'Deferred since 8&ndash;10 Sep so it didn’t hold up launch; all three couriers are bookable from Admin today, cross-provider sync is not built', 'Scoping + engineering'],
  ['Partner/NGO bulk-match workflow', 'Not started', 'NGOs can apply and be approved; matching a bulk donation to the right partner is a real feature, not a quick patch', 'Scoping + engineering'],
  ['Defects picker, condition scale, liability waiver, photo guide', 'Not started', 'Good ideas from the 19 Sep deep-test session; need design thought', 'Design + engineering'],
  ['Dashboard loading-state polish (all admin screens)', 'In progress', 'Shipped on the Wall; rollout to every dashboard screen is next', 'Engineering time'],
  ['Donor dashboard data-fetch efficiency', 'In progress', 'Partially optimized; a further pass will cut repeated lookups', 'Engineering time'],
]

// Closed the same evening this roadmap was first published — kept visible so
// the client can see exactly what changed between the two PDF revisions.
const CLOSED_ROWS = [
  ['Phone autofill on signup', 'Root cause was a missing `autoComplete` hint on the signup phone field; the Give form’s equivalent field already had it and worked. Fixed on signup, the claim modal, contact/partner forms, and the account phone field.'],
  ['Delivery/chat screen scoped to the active claim only', 'Confirmed each claim and donation has its own dedicated detail page and chat thread (/account/claims/:id, /account/gives/:id); re-verified against the rebuilt Admin Control Center’s Claims/Deliveries views, which use the same single-record scoping.'],
]

function renderPendingTable() {
  const statusClass = (s) => {
    if (s.startsWith('In progress')) return 'progress'
    if (s.startsWith('Not started')) return 'notstarted'
    return 'open'
  }
  return `
  <table class="pending-table">
    <thead><tr><th>Item</th><th>Status</th><th>Why it's not done</th><th>Blocked on</th></tr></thead>
    <tbody>
      ${PENDING_ROWS.map(
        ([item, status, why, blocker]) => `<tr>
          <td class="item-cell">${item}</td>
          <td><span class="status-pill ${statusClass(status)}">${status}</span></td>
          <td>${why}</td>
          <td class="blocker-cell">${blocker}</td>
        </tr>`
      ).join('')}
    </tbody>
  </table>`
}

function renderClosedList() {
  return `
  <div class="closed-list">
    <div class="closed-head">Closed out 3 Oct (evening)</div>
    ${CLOSED_ROWS.map(
      ([name, note]) => `<div class="closed-item"><span class="badge-done">FIXED &amp; LIVE</span><span class="closed-text"><strong>${name}</strong> &mdash; ${note}</span></div>`
    ).join('')}
  </div>`
}

function render() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>RELOVED Project Roadmap</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    color: #1a1a1a;
    font-size: 9.6pt;
    line-height: 1.5;
    background: #fff;
  }
  .cover {
    padding: 56px 56px 40px 56px;
    background: #0a0a0a;
    color: #fff;
  }
  .cover .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 26px; }
  .cover .brand-mark {
    width: 34px; height: 34px; border-radius: 50%;
    background: conic-gradient(from 180deg, #ff2e8b, #a6e639, #ff2e8b);
    flex-shrink: 0;
  }
  .cover .brand-name { font-size: 15pt; font-weight: 800; letter-spacing: 0.08em; }
  .cover h1 { font-size: 25pt; font-weight: 800; margin: 0 0 8px 0; letter-spacing: -0.01em; }
  .cover .subtitle { color: #cfcfcf; font-size: 10.5pt; margin: 0 0 24px 0; max-width: 520px; }
  .cover .meta-row { display: flex; gap: 26px; flex-wrap: wrap; }
  .cover .meta-item .label { text-transform: uppercase; letter-spacing: 0.08em; font-size: 7.3pt; color: #999; font-weight: 700; }
  .cover .meta-item .value { font-size: 10pt; color: #fff; margin-top: 3px; font-weight: 600; }

  .content { padding: 30px 48px 50px 48px; }
  section { page-break-inside: avoid; break-inside: avoid; margin-bottom: 26px; }
  section.gantt-section { page-break-inside: auto; break-inside: auto; }

  h2.section-head {
    font-size: 12pt; font-weight: 800; margin: 0 0 12px 0; padding-top: 16px;
    border-top: 2px solid #111;
  }
  h2.section-head:first-of-type { padding-top: 0; border-top: none; }

  p { margin: 0 0 10px 0; color: #2a2a2a; }
  ol { margin: 0 0 14px 0; padding-left: 18px; }
  ol li { margin-bottom: 8px; }
  p.note { font-style: italic; color: #666; font-size: 8.8pt; margin-top: 14px; }

  table.kv-table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 9pt; }
  table.kv-table td { padding: 7px 10px; border-bottom: 1px solid #eae8e4; vertical-align: top; }
  table.kv-table td:first-child { font-weight: 800; width: 180px; color: #111; }

  /* Gantt */
  .gantt { margin-top: 6px; }
  .gantt-head-row { display: flex; margin-bottom: 4px; }
  .gantt-label-head { width: 190px; flex-shrink: 0; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 800; color: #777; align-self: flex-end; padding-bottom: 4px; }
  .gantt-cols { flex: 1; display: flex; }
  .gantt-col-head { flex: 1; text-align: center; border-left: 1px solid #ece9e4; padding: 2px 2px 4px 2px; }
  .gantt-col-head.phase2 { background: #faf5fb; }
  .gantt-col-head .w { font-size: 7.8pt; font-weight: 800; color: #111; }
  .gantt-col-head .d { font-size: 6.3pt; color: #888; margin-top: 1px; }

  .gantt-row { display: flex; align-items: stretch; border-top: 1px solid #f0efec; page-break-inside: avoid; break-inside: avoid; }
  .gantt-label { width: 190px; flex-shrink: 0; padding: 7px 10px 7px 0; }
  .gantt-label .name { font-size: 8.2pt; font-weight: 700; color: #111; line-height: 1.25; }
  .gantt-label .note { font-size: 6.9pt; color: #888; margin-top: 1px; }
  .gantt-track { flex: 1; position: relative; min-height: 30px; }
  .gridline { position: absolute; top: 0; bottom: 0; width: 1px; background: #f0efec; }
  .gantt-bar { position: absolute; top: 7px; bottom: 7px; border-radius: 4px; opacity: 0.92; }
  .gantt-bar.progress { background-image: repeating-linear-gradient(45deg, rgba(255,255,255,0.35) 0, rgba(255,255,255,0.35) 4px, transparent 4px, transparent 8px); }
  .gantt-bar.notstarted { opacity: 0.55; }

  .gantt-legend { display: flex; gap: 18px; margin-top: 12px; padding-top: 10px; border-top: 1px solid #ece9e4; }
  .legend-item { font-size: 7.8pt; font-weight: 700; color: #444; display: inline-flex; align-items: center; gap: 5px; }
  .legend-item .dot { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }

  /* Pending table */
  table.pending-table { width: 100%; border-collapse: collapse; font-size: 8.3pt; }
  table.pending-table th {
    text-align: left; text-transform: uppercase; letter-spacing: 0.04em; font-size: 7pt; font-weight: 800;
    color: #777; padding: 0 8px 6px 0; border-bottom: 1.5px solid #111;
  }
  table.pending-table td { padding: 7px 8px 7px 0; vertical-align: top; border-bottom: 1px solid #eae8e4; }
  table.pending-table tr { page-break-inside: avoid; break-inside: avoid; }
  td.item-cell { font-weight: 700; color: #111; width: 20%; }
  td.blocker-cell { color: #666; width: 15%; }
  .status-pill {
    display: inline-block; font-size: 6.6pt; font-weight: 800; text-transform: uppercase;
    letter-spacing: 0.02em; padding: 2.5px 7px; border-radius: 20px; white-space: nowrap;
  }
  .status-pill.progress { background: #fff3e0; color: #9a5b00; border: 1px solid #f5d9a8; }
  .status-pill.notstarted { background: #fbeaf3; color: #9c2566; border: 1px solid #f0bcd8; }
  .status-pill.open { background: #fdeceb; color: #a33327; border: 1px solid #f3c3bd; }

  .closed-list { margin-top: 14px; padding-top: 12px; border-top: 1px solid #ece9e4; }
  .closed-head { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.07em; font-weight: 800; color: #1b7a3d; margin-bottom: 8px; }
  .closed-item { display: grid; grid-template-columns: 92px 1fr; column-gap: 10px; align-items: baseline; padding: 4px 0; page-break-inside: avoid; break-inside: avoid; }
  .badge-done { justify-self: start; display: inline-block; font-size: 6.4pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.02em; padding: 2.5px 7px; border-radius: 20px; background: #e3f6e8; color: #1b7a3d; border: 1px solid #bfe8cb; white-space: nowrap; }
  .closed-text { font-size: 8.3pt; color: #2a2a2a; }
  .closed-text strong { color: #111; }

  .timeline-narrative h3 { font-size: 10pt; font-weight: 800; margin: 16px 0 6px 0; color: #111; }
  .timeline-narrative p { margin-bottom: 8px; }
  .timeline-narrative ul { margin: 0 0 10px 0; padding-left: 18px; }
  .timeline-narrative li { margin-bottom: 5px; }

  .closing {
    margin-top: 18px; padding-top: 14px; border-top: 1px solid #e5e3df;
    font-style: italic; color: #666; font-size: 9pt;
  }
</style>
</head>
<body>
  <div class="cover">
    <div class="brand">
      <div class="brand-mark"></div>
      <div class="brand-name">RELOVED</div>
    </div>
    <h1>Project Roadmap &amp; Consolidated Patch Notes</h1>
    <p class="subtitle">Combines every patch-notes update, client fix log, and status report issued to date into one document.</p>
    <div class="meta-row">
      <div class="meta-item"><div class="label">Prepared by</div><div class="value">Aniket Gupta</div></div>
      <div class="meta-item"><div class="label">Prepared for</div><div class="value">Sheetal Ahuja &middot; Totem Interactive</div></div>
      <div class="meta-item"><div class="label">Covers</div><div class="value">21 Aug &ndash; 3 Oct 2026</div></div>
      <div class="meta-item"><div class="label">Last updated</div><div class="value">3 October 2026</div></div>
    </div>
  </div>
  <div class="content">
    <section>
      <h2 class="section-head">Executive Summary</h2>
      ${EXEC_SUMMARY_HTML}
    </section>

    <section class="gantt-section">
      <h2 class="section-head">Development Timeline (Roadmap)</h2>
      <p>Seven working weeks, 21 Aug &ndash; 3 Oct 2026, plus the Phase 2 backlog. Solid bars are shipped and live; striped bars are in progress; faded bars are not yet started.</p>
      ${renderGanttHtml()}
    </section>

    <section class="timeline-narrative">
      <h2 class="section-head">Phase-by-Phase Narrative</h2>
      <h3>21 Aug &ndash; 26 Sep: Product build and live testing</h3>
      <p>Documented day-by-day with the exact client feedback behind each fix in <code>RELOVED_PATCH_NOTES.md</code>. Headlines: first version shipped by 29 Aug; first client feedback round 31 Aug; Privacy Policy and building-gate handoff protocol locked in by 10 Sep; Give/Claim/email flows connected end to end by 12 Sep; 3km matching and notification-copy rewrite by 16 Sep; live Friends &amp; Family testing on 18&ndash;19 Sep produced the single largest batch of real-usage fixes in one evening; full site QA audit and public launch on reloved.digital by 24 Sep; Admin Overview and MSG91 SMS templates live by 26 Sep.</p>
      <h3>27 Sep &ndash; 3 Oct: Admin Control Center, security hardening, final feature push</h3>
      <p>27 Sep fixed live Drop/Claim breakage (storage bucket, a coordinate bug, grey-box Wall photos). 28&ndash;30 Sep ran two tracks in parallel: the Admin Control Center was rebuilt into one operational surface across 8 modules (released 30 Sep with 28/28 UI tests, 32/32 live-safety tests, 65/65 backend tests passing), while an independent security/concurrency audit closed race-condition and data-safety gaps, and a scalability plan was written for 1,000+ users. 1 Oct shipped Borzo/Shadowfax courier booking in Admin, fixed a misrouted-notification bug, and reworked the photo-AI pipeline. 2&ndash;3 Oct merged the Admin Control Center into the live handover branch and shipped donor instant schedule confirmation, a 15km matching radius (up from 3km), and FREE badges &mdash; the most recent release.</p>
    </section>

    <section>
      <h2 class="section-head">Pending Work / Phase 2 Roadmap</h2>
      <p>Nothing below blocks the platform from running day-to-day. This is what moves Reloved from &ldquo;live and working&rdquo; to &ldquo;fully finished and scaled.&rdquo;</p>
      ${renderPendingTable()}
      ${renderClosedList()}
    </section>

    <p class="closing">Full detail at every level of granularity lives in the companion documents: <code>RELOVED_PATCH_NOTES.md</code> (day-by-day), <code>report.md</code> (grouped by feature area), <code>Reloved_Status_Report.pdf</code> (journey + pillars), and <code>ADMIN_CONTROL_CENTER_RELEASE_NOTES.md</code> (admin rebuild detail). This document is the single entry point that ties them together.</p>
  </div>
</body>
</html>`
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const html = render()

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
        <span>RELOVED &middot; Project Roadmap</span>
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

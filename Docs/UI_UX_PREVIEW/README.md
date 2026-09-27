# Reloved local visual review · 28 September 2026

**Status:** revised interactive prototype for visual review. It is isolated from application routes and APIs. No customer account, upload, claim, submission, schedule, or backend transition is connected.

## Open locally

From the `reloved-live/.worktrees/public-experience` worktree, run:

```sh
python3 -m http.server 3191 --bind 127.0.0.1
```

Open `http://127.0.0.1:3191/Docs/UI_UX_PREVIEW/`. The persistent dark toolbar chooses the core and supporting screens and labelled synthetic scenarios. The customer layout starts below it. The toolbar also separates **Existing baseline**, **Rejected proposal**, and **Revised prototype**. The currently running local review uses this URL; another free port works if 3191 is occupied.

## What the review shows

- Home with normal, one-item, and empty inventory; Wall with filters, search, sparse, empty, loading, and failure states.
- Item detail with front/back gallery, full item ID and unavailable/long-title states.
- Drop an item with the existing One Item/Multiple Items choice, selected front/back photos grouped by item, local photo selection, removal, group editing, real guest/signed-in step labels, draft detail retention between steps, and a toolbar-only simulated receipt state.
- Account tabs and claim detail with waiting and action-required synthetic states. Valid cancellation/chat/address affordances remain visible, while actual submission and messaging are unavailable.
- Supporting public pages: Track lookup/drop/claim/loading/not-found/error, all 24 source FAQs, Our Story, Contact, Community Impact Map, Wall of Love, Quality & Safety Standards, and Partner application. Header, mobile menu, footer, FAQ links, receipt tracking, and recovery actions stay in the local review.
- A System States family reviews signed-out, restricted, missing URL/not-found, and generic failure states. Restricted copy is explicitly marked as undefined in the source; no authentication or permission check occurs.
- Contact and Partner forms validate locally and explicitly state that nothing is sent. The map uses existing synthetic inventory in an illustrative locality layout; Wall of Love uses the honest empty/loading source states without stock recipient photographs.
- A mobile menu/filter sheet, keyboard focus handling, short CSS motion, and reduced-motion support. Local action toasts explicitly say when a change exists only in the preview.

All product photographs are from `frontend/public/images/wall-items/display`. Home uses the existing `hero-bg-desktop-lamps-wide.webp` courtyard and existing `reloved-logo.webp` badge, with the supplied wordmark artwork in the navigation. The Home hero and Wall catalogue retain the live site's composition and public wording. Bricolage Grotesque and Manrope variable WOFF2 files are stored with their SIL Open Font License notices under `assets/fonts/`; browser checks verify loading. The [Bricolage license](https://github.com/google/fonts/blob/main/ofl/bricolagegrotesque/OFL.txt) and [Manrope license](https://github.com/google/fonts/blob/main/ofl/manrope/OFL.txt) permit embedding and redistribution with their notices.

The Home, Wall, and Drop landing text was checked against `https://reloved.digital/`, `/drop`, and `/give` in a read-only browser on 28 September 2026. No form action, login, or production endpoint was called during that inspection.

## Evidence and comparison

| Label | Evidence |
| --- | --- |
| Existing baseline | [`evidence/`](evidence/) contains the connected app's historical browser captures, including the courtyard homepage and Give/claim views. These used synthetic read-only fixtures and do not prove a live backend. |
| Rejected proposal | [`archive/rejected-v1/index.html`](archive/rejected-v1/index.html) and its screenshots preserve the static four-screen proposal. |
| Revised prototype | [`revised/final/`](revised/final/) contains the final 390/1440px family captures, doubled-text pressure captures, `interaction-review.webm`, and verification JSON. The four-width automated checks cover 320, 390, 768 and 1440px. Earlier captures remain in `revised/` for chronology. |

## Limits

The screenshots and recording are from headless Chromium, not a physical phone or Instagram browser. The local review has no auth, APIs, analytics, persistence, real upload or production readiness. The selected photos are existing Reloved item assets, not a customer draft. A chosen local file uses an in-memory blob URL and is never sent. No footwear or bag image was present in the checked-in display inventory, so those categories remain a visual coverage gap. Customer-facing prototype wording is drawn from the current site and repository; any local review feedback is identified as preview-only. The simulated receipt is a visual state and does not confirm a submission. Publication and courier behavior remain subject to the unresolved policy ledger in [`../UI_UX_AUDIT.md`](../UI_UX_AUDIT.md).

## Supporting-page verification

Run `node Docs/UI_UX_PREVIEW/revised/supporting-pages-smoke.mjs` against the local server. This checks all 25 supporting scenarios at 320/390/768/1440px, navigation, FAQ keyboard interaction, tracking, form validation, map filters, recovery actions, mobile customer touch targets, browser errors, and external/write requests. Screenshots are in `revised/support-*.png`; machine-readable results are in `revised/supporting-pages-verification.json`.

Source copy is retained verbatim, including existing FAQ statements about Shiprocket/first-500 rides/COD and immediate publication. These conflict with other checked-in policy wording and remain a policy decision; this review does not verify those promises. Supporting pages have no historical baseline capture, and the review toolbar states that explicitly.

## Final review checklist · 28 September 2026

- **Core:** Home normal/one/zero items; Wall normal/sparse/empty/loading/failure and availability filters; detail available/matched/claimed/unavailable/owner/limit/long title with front/back gallery; Give guest/signed-in/saved-profile, restored draft, failure/loading/simulated receipt, every step and per-item editing; Account all four tabs with empty/loading/failure/action/completed states; Claim pending/waiting/address/time/handover/completed/declined/cancelled/unavailable.
- **Supporting:** Track lookup/drop/claim/not-found/loading/error; all 24 FAQ entries; Our Story; Contact and Partner local validation/error states; Map localities/empty/loading/error; Wall of Love empty/loading; Standards; signed-out/restricted/missing URL/generic failure recovery.
- **Rendered checks:** all 70 scenario choices at 320/390/768/1440, 200% text pressure across 15 families at those widths, additional Give steps and Account tabs; fonts loaded, images decoded, no replacement-square glyphs, no page overflow, unclipped single-row Give progress, customer 44px targets, focus visibility/containment/return, overlay stacking, short motion and reduced motion. Native review-toolbar controls are review tooling and are excluded from customer touch-target assertions.
- **Visual corrections:** restored dark Our Story text, restored filled primary system/dialog actions, enlarged small navigation targets, allowed enlarged labels to reflow, removed continuous shimmer, gated hover to fine pointers, and retained visible static loading labels, removed the empty Give action rail, and protected footer badge proportions at tablet widths. Home hero sequence, Wall structure, supplied branding, customer copy and assets remain intact.

Run the final checks from the worktree with the local server active:

```sh
node Docs/UI_UX_PREVIEW/revised/core-journeys-smoke.mjs
node Docs/UI_UX_PREVIEW/revised/supporting-pages-smoke.mjs
node Docs/UI_UX_PREVIEW/revised/final-review.mjs
```

The final script saves [verification.json](revised/final/verification.json), detailed [checks.json](revised/final/checks.json), 30 full-page family screenshots (each of the 15 families at 390 and 1440), four Give/Wall pressure screenshots at 320/768, three doubled-text screenshots, one loading screenshot and the [interaction recording](revised/final/interaction-review.webm). It observes requests throughout checks and recording. The recording shows the mobile menu, category filter, gallery back angle, Give photo → details → login, Account address action → waiting, and FAQ → Standards navigation. Every interaction uses synthetic local data and performs no real submission or login.

`agent-browser` was not available (`command -v agent-browser` returned no path); verification uses the already installed Playwright package and local Google Chrome, with no tooling installation. Text pressure doubles every customer element's computed font size and numeric line height, including pixel-sized labels; this is an equivalent stress test, not a claim of native browser text-zoom certification. Physical-device, screen-reader, Safari and Instagram-browser testing remain outstanding.

## Implementation readiness

| Group | Review readiness | Remaining gate |
| --- | --- | --- |
| Shared public typography, controls, Home/Wall/detail | Visual prototype and responsive evidence available | Aakash's design approval; scoped component ownership and implementation-plan approval |
| Give, Account, claim lifecycle, tracking | Synthetic states and local interactions reviewed | Integration contracts, real validation/auth/upload/API regression tests, truthful publication/courier policy |
| FAQ, Story, Contact, Standards, Partner | Current source copy and local forms reviewed | Policy/copy conflicts and real form/service integration |
| Map, Wall of Love, restricted/system states | Honest illustrative/empty/recovery states available | Real data/privacy behavior and restricted-state copy approval |
| Privacy, Terms, QR, login/onboarding, partner dashboard/admin | No new final prototype coverage | Separately scoped review; external QR generation and authentication not exercised |

This evidence is ready for a design decision. It does not establish application implementation, deployment or production readiness.

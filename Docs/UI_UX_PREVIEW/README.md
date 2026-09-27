# Reloved local visual review · 28 September 2026

**Status:** revised interactive prototype for visual review. It is isolated from application routes and APIs. No customer account, upload, claim, submission, schedule, or backend transition is connected.

## Open locally

From the `reloved-live/.worktrees/public-experience` worktree, run:

```sh
python3 -m http.server 3191 --bind 127.0.0.1
```

Open `http://127.0.0.1:3191/Docs/UI_UX_PREVIEW/`. The persistent dark toolbar chooses the six screens and labelled synthetic scenarios. The customer layout starts below it. The toolbar also separates **Existing baseline**, **Rejected proposal**, and **Revised prototype**. The currently running local review uses this URL; another free port works if 3191 is occupied.

## What the review shows

- Home with normal, one-item, and empty inventory; Wall with filters, search, sparse, empty, loading, and failure states.
- Item detail with front/back gallery, full item ID and unavailable/long-title states.
- Drop an item with the existing One Item/Multiple Items choice, selected front/back photos grouped by item, local photo selection, removal, group editing, real guest/signed-in step labels, draft detail retention between steps, and a toolbar-only simulated receipt state.
- Account tabs and claim detail with waiting and action-required synthetic states. Valid cancellation/chat/address affordances remain visible, while actual submission and messaging are unavailable.
- A mobile menu/filter sheet, keyboard focus handling, short CSS motion, and reduced-motion support. Local action toasts explicitly say when a change exists only in the preview.

All product photographs are from `frontend/public/images/wall-items/display`. Home uses the existing `hero-bg-desktop-lamps-wide.webp` courtyard and existing `reloved-logo.webp` badge, with the supplied wordmark artwork in the navigation. The Home hero and Wall catalogue retain the live site's composition and public wording. Bricolage Grotesque and Manrope variable WOFF2 files are stored with their SIL Open Font License notices under `assets/fonts/`; browser checks verify loading. The [Bricolage license](https://github.com/google/fonts/blob/main/ofl/bricolagegrotesque/OFL.txt) and [Manrope license](https://github.com/google/fonts/blob/main/ofl/manrope/OFL.txt) permit embedding and redistribution with their notices.

The Home, Wall, and Drop landing text was checked against `https://reloved.digital/`, `/drop`, and `/give` in a read-only browser on 28 September 2026. No form action, login, or production endpoint was called during that inspection.

## Evidence and comparison

| Label | Evidence |
| --- | --- |
| Existing baseline | [`evidence/`](evidence/) contains the connected app's historical browser captures, including the courtyard homepage and Give/claim views. These used synthetic read-only fixtures and do not prove a live backend. |
| Rejected proposal | [`archive/rejected-v1/index.html`](archive/rejected-v1/index.html) and its screenshots preserve the static four-screen proposal. |
| Revised prototype | [`revised/`](revised/) contains browser captures at 320, 390, 768 and 1440px, edge-state captures, `interaction-review.webm`, and automated local verification. |

## Limits

The screenshots and recording are from headless Chromium, not a physical phone or Instagram browser. The local review has no auth, APIs, analytics, persistence, real upload or production readiness. The selected photos are existing Reloved item assets, not a customer draft. A chosen local file uses an in-memory blob URL and is never sent. No footwear or bag image was present in the checked-in display inventory, so those categories remain a visual coverage gap. Customer-facing prototype wording is drawn from the current site and repository; any local review feedback is identified as preview-only. The simulated receipt is a visual state and does not confirm a submission. Publication and courier behavior remain subject to the unresolved policy ledger in [`../UI_UX_AUDIT.md`](../UI_UX_AUDIT.md).

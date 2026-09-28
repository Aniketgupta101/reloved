# Actual public application — local implementation evidence

Captured 28 September 2026 from the production-built React app on `design/public-experience` using installed headless Google Chrome and Playwright. These are actual application captures, distinct from the [approved prototype](../UI_UX_PREVIEW/revised/final/) and historical baseline/rejected proposals.

**Every account, item, request, reference and response is synthetic local fixture data.** Authentication tokens are inert fixture strings. API requests are intercepted and explicitly fulfilled locally; unexpected origins and unconfigured writes fail the audit. The map uses an empty local style response. No live login, upload, claim, message, courier booking, email or external service connection is demonstrated. Customer wording visible in screenshots is existing application copy and is not evidence that the described transaction occurred.

## Capture index and state coverage

| Family | Mobile | Desktop | State coverage in focused checks |
| --- | --- | --- | --- |
| Home | [390px](home-390.png) | [1440px](home-1440.png) | normal, sparse, empty, delayed inventory |
| Wall | [390px](wall-390.png) | [1440px](wall-1440.png) | search/filter/sheet, loading/failure, availability, aliases |
| Item | [390px](item-390.png) | [1440px](item-1440.png) | gallery, unavailable/owner/quota, claim/help/partner overlays |
| Give | [390px](give-390.png) | [1440px](give-1440.png) | photo grouping, details, auth return, review, validation, failure/retry, receipt |
| Account | [390px](account-390.png) | [1440px](account-1440.png) | tabs, empty/current/history, notification/profile actions |
| Claim | [390px](claim-390.png) | [1440px](claim-1440.png) | pending/action/waiting/handover/completed/declined/cancelled |
| Gift | [390px](gift-390.png) | [1440px](gift-1440.png) | item targeting, edits, decisions, scheduling, courier and receipt controls |
| Track | [390px](track-390.png) | [1440px](track-1440.png) | lookup, valid/long result, loading/missing/failure/denied |
| FAQ | [390px](faq-390.png) | [1440px](faq-1440.png) | keyboard questions and answer associations |
| Story | [390px](story-390.png) | [1440px](story-1440.png) | source copy, responsive content |
| Contact | [390px](contact-390.png) | [1440px](contact-1440.png) | validation, pending, exact local payload, failure/retry/success |
| Standards | [390px](standards-390.png) | [1440px](standards-1440.png) | source copy and readable semantic colors |
| Partner | [390px](partner-390.png) | [1440px](partner-1440.png) | consent/categories, validation, exact local payload, retry/reference |
| Map | [390px](map-390.png) | [1440px](map-1440.png) | area filtering, fallback, loading/empty/failure; remote tiles unverified |
| Love | [390px](love-390.png) | [1440px](love-1440.png) | returned item photographs, loading/empty/failure |
| System | [390px](system-390.png) | [1440px](system-1440.png) | content-only 404, recovery destination, excluded legacy shell |

The screenshots show representative states; the focused suites exercise the additional states in the last column. They are not all separately captured here. Ten `text-200-{wall,give,claim,contact,system}-{320,768}.png` captures show doubled computed font sizes and numeric line heights, including the shared public shell. This is a layout stress test, not native browser text zoom certification. All four widths (320/390/768/1440) are audited for overflow, actual loaded fonts, decoded images and reduced motion.

[Interaction recording](interaction-review.webm): mobile menu → Wall filter → gallery angle → Give photo-to-details step → pending claim cancellation dialog and Escape. Cancellation is opened and dismissed; no cancellation is submitted. Give starts with a synthetic saved photo draft; no live upload occurs. The pending claim is a fixture. Recording uses reduced motion to match the audited contexts.

## Reproduction

Run from `frontend/` in this worktree. No dependency installation is needed.

```sh
npm run lint
VITE_API_URL='' VITE_ASSET_BASE='' VITE_POSTHOG_KEY='' npm run build
node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4326 --strictPort
```

With that built preview running, execute each command serially:

```sh
PUBLIC_BASE_URL=http://127.0.0.1:4326 node scripts/verify-public-foundation.mjs
PUBLIC_BASE_URL=http://127.0.0.1:4326 node scripts/verify-public-browse.mjs
PUBLIC_BASE_URL=http://127.0.0.1:4326 node scripts/verify-public-give.mjs
PUBLIC_BASE_URL=http://127.0.0.1:4326 node scripts/verify-public-account.mjs
PUBLIC_BASE_URL=http://127.0.0.1:4326 node scripts/verify-public-support.mjs
PUBLIC_BASE_URL=http://127.0.0.1:4326 node scripts/verify-item-dialogs.mjs
PUBLIC_BASE_URL=http://127.0.0.1:4326 node scripts/verify-public-give-pressure.mjs
PUBLIC_BASE_URL=http://127.0.0.1:4326 node scripts/verify-public-header-pressure.mjs
node scripts/verify-admin-overview-fallback.mjs
PUBLIC_BASE_URL=http://127.0.0.1:4326 node scripts/verify-public-integrated.mjs
git diff --check 34331d8dfae19c3a2baaba9e52e7eff5a06b4520...HEAD
```

The integrated runner writes the 32 representative screenshots, ten text-pressure screenshots, recording and [machine-readable checks](verification.json). The overlay runner saves its eight dialog screenshots under `.local-proof/task-6/item-dialogs/`; the final reviewed copies are also stored here as `dialog-{claim,help,partner}-{320,1440}.png`.

## Verification results

| Gate | Result |
| --- | --- |
| Foundation | 9 passed |
| Browse | 52 passed |
| Give | 27 passed |
| Account/lifecycle | 64 passed |
| Supporting pages | 73 passed |
| Item dialogs (including local success receipt and short-screen steps) | 8 passed |
| Give normal/enlarged-text regression | 4 passed |
| Header bounds, text pressure, menu and contextual CTA | 32 passed |
| Integrated routes, images/fonts, scope and recording | 93 passed |
| Admin fallback local runtime regression | passed |
| TypeScript (`npm run lint`) | passed |
| Production build | passed, existing chunk-size advisory only |
| `git diff --check` | passed |

Total: **225 existing browser scenarios + 44 focused regressions + 93 integrated checks = 362 browser checks**, plus one local admin runtime regression. All checks passed in their recorded runs against a clean local production build. The review-round rerun scope is recorded below; unaffected suites retain the preceding integration results.

The evidence contains **56 genuine screenshots** (32 phone/desktop family views, ten enlarged-text views, eight Item dialog views and six header boundary views) and a **6.12-second, 390×900 WebM**. The recording was decoded locally and frames at 1.000, 2.142, 4.284 and 5.870 seconds were inspected. The checked-in original captures are unmodified; temporary review contact sheets/crops are kept only in ignored local evidence.

Visual review covered all 16 families at 390/1440 via contact sheets, all ten 320/768 enlarged-text captures, and direct narrow claim/help dialog views. Re-inspected the complete 320px enlarged-text Give capture after correction: full progress words, contained photographs, compact readable badges, whole Camera/Gallery labels and reachable Continue action. The original Home hero remains, lifecycle identity/status/action precede support, and the content-only 404 intentionally retains its legacy header/footer. The map's blank background is the disclosed local tile stub, not a live-map result.


## Review round 1 — short-screen claim focus

At 320×600, Continue previously left the focused heading above the dialog viewport; Back left focus on BODY. Two failing regressions preceded a change to the existing step effect: reset the dialog scroll and focus its heading on each actual step change, preserving initial focus ownership and all form state. The tests verify active heading bounds, retained name/note, modal containment, request payload and dismissal/navigation cleanup. See [confirmation focus](dialog-claim-320x600-forward.png) and [details focus after Back](dialog-claim-320x600-back.png).

Fresh requested reruns: **8 Item dialog + 52 browse + 9 foundation + 93 integrated = 162 browser checks**, all passed serially on the built local preview at port 4327. TypeScript, production build and diff checks also passed. The unaffected Give, lifecycle, support, Give-pressure and admin suites retain their previous complete integration results; they were not rerun in this focused round. Only `ItemDetail.tsx` changed in production code. Screenshot/recording outputs were refreshed; both new short-screen views and four recording frames were inspected.

## Final branch review — enlarged-text navigation

The focused suite reproduced eight failures before the fix, including the Contact CTA extending to x=1315 at a 1200px viewport with doubled computed text. Header controls and text are now checked at 767/768/769, 1199/1200/1201, 1279/1280/1281 and 1439/1440/1441px at normal and doubled text. A container query switches to the compact menu when text needs more space; normal 1200/1440 desktop navigation remains. Menu cleanup observes the actual trigger visibility, covering viewport and text-size changes together. Tests also cover focus containment/return, scroll cleanup, and Contact/Give/Account contextual CTAs.

Fresh final reruns: **32 header + 9 foundation + 93 integrated = 134 browser checks**, all passed serially against the newly built preview at port 4328. TypeScript and production build passed. Other suites retain the earlier recorded results; the cumulative 362 count is coverage across the recorded runs, not a claim that all suites were rerun in this round. Both OFL files received only trailing-space removal; their license wording is unchanged. The final committed branch passed `git diff --check 34331d8dfae19c3a2baaba9e52e7eff5a06b4520...HEAD`.

Six new captures were visually inspected alongside four frames from the refreshed recording:

| Viewport | Normal text | Doubled text |
| --- | --- | --- |
| 768px | [normal](header-contact-768-text-100.png) | [doubled](header-contact-768-text-200.png) |
| 1200px | [normal](header-contact-1200-text-100.png) | [doubled](header-contact-1200-text-200.png) |
| 1440px | [normal](header-contact-1440-text-100.png) | [doubled](header-contact-1440-text-200.png) |

The original six captures are saved by `verify-public-header-pressure.mjs` under `.local-proof/task-6/header-pressure/` and copied here without image editing. Computed-text scaling remains a layout stress test; native browser text zoom and additional browsers are not certified.

## Remaining limits

Fixtures prove rendered UI and controller contracts. They do not establish backend authorization, live authentication, storage/AI uploads, handover transitions, courier/maps/geocoding, analytics delivery, email or support delivery, or production readiness. Physical phones, Safari, screen-reader speech, native keyboard behavior and Instagram browser remain unverified. Privacy/Terms source text, QR, donor onboarding/login layouts, partner authentication/dashboard and admin presentation were not redesigned.

The existing >500 KB build chunk advisory remains. Source inspection also confirms that Item Detail fetch failures retain the existing Item not found fallback. Current Track missing/failure equivalence and Map/Love failure-as-empty behavior are preserved. Publication wording, partial-bulk recovery and courier/FAQ policy conflicts remain in the existing audit ledger. Separate connected-environment review is required before a production-readiness claim. No push, merge, PR or deployment was performed by this integration task.

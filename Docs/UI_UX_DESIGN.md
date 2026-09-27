# Reloved public experience — design specification

**Review status:** proposed, awaiting Aakash's written design approval. Dated 27 September 2026. This is the specification for presentation changes inside the existing React application, not permission to alter code, onboarding, backend policy, admin or recovery behavior. Read with [UI_UX_AUDIT.md](UI_UX_AUDIT.md) and the local [visual preview](UI_UX_PREVIEW/index.html).

## Direction and source rules

**One direction: a quiet editorial Wall of Kindness.** Reloved should feel like a considerate fashion catalogue whose pieces happen to be given freely. The products provide texture; the identity provides a memorable signature; the interface provides calm, legible decisions. The supplied brand PDF's identity hierarchy and palette control this design. Its page-12 illustrative website frame is *not* the interface pattern because the current brief rejects neo-brutalism.

- Brand PDF pp2–3: desirable, dignified fashion first; supplied **wordmark** is the primary site mark, circular badge is a campaign/impact signature, ring is a supporting device. Use the actual `RELOVED_Primary_Wordmark_Black.svg` from the supplied asset pack, never font lettering as a stand-in. The docs preview contains a copy; application use waits for approval. Keep the mark level, proportional, high-contrast, at least 120px wide with R-height clear space; badges at least 48px per p8.
- PDF p5: ink `#111111`, warm ivory `#F4F0E8`, pink `#F42B8C`, magenta `#C51D8C`, ring green `#9BE34A`. Ink/ivory/white carry the interface. Pink marks selected/brand moments; magenta is a limited strong accent/focus; green belongs mainly to the ring and an occasional success cue. Do not make green the default call to action.
- PDF p12: light canvas, item photography first, ₹0 as an attribute, controlled colour, story as a second layer, subtle motion. Page 14 says to reuse masters. Preserve actual Reloved images and their angles, with `object-fit: contain` and neutral image wells.
- Attached Farfetch catalogue screenshots: borrow large consistent image wells, aligned card baselines, easy scan from photo → title → detail, and a quiet filter strip. The supplied images **do not document Farfetch's detail gallery**, so the item-detail hierarchy below is our design decision informed by the brief, not a screenshot claim. Do not add paid-cart, wishlist, prices, policies or brand styling from Farfetch.
- [Snag's public landing page](https://snagapp.com/), viewed 27 September: borrow the direct one-line benefit and nearby/free clarity. Only its public landing was inspected; no app flow or service policy is inferred. Reloved's own giving/claiming vocabulary remains.

## Current tokens versus approved identity

| Role | Current `frontend/src/index.css` | Proposed **public-scoped** token | Use |
| --- | --- | --- | --- |
| Canvas | `#F4F1EA` | `#F4F0E8` | Warm ivory page background; white functional panels |
| Ink | `#111111` | `#111111` | Main text and primary action |
| Pink | `#EC2F9B` | `#F42B8C` | Selection, small brand line, limited calls to attention |
| Magenta | no dedicated role | `#C51D8C` | Focus and stronger accent where contrast passes |
| Ring green | `#BFE53A` | `#9BE34A` | Badge/ring detail, small success indicator; not a wall of green |
| Other accents | blue `#2A48FF`, red `#FF4D3E`, yellow `#FFDE59` | semantic state colors only where existing status meaning requires; avoid ornamental use | Existing statuses remain distinct; no automatic substitution |
| Surfaces/line | `#FFFFFF`, `#EBE7DF`, `#E5E5E5` | white, `#F8F7F3` image well, `#D8D3C9` separator | Derived UI neutrals, not new brand signatures |
| Muted type | `#595959` | `#595959` | Secondary readable text |

These are **migration tokens**, not a blind global Tailwind replacement. Add them under a public visual scope; leave current globals and admin/partner/recovery routes unchanged until shared-file ownership is agreed. Never use pink or green body text on ivory when contrast is weak. Interactive text is ink/ivory; focus ring uses the darker magenta plus outline offset. Audit actual contrast at implementation time.

## Type, layout and components

| Element | Specification and states |
| --- | --- |
| Fonts | Keep the repository's **Manrope** body and **Bricolage Grotesque** display families (`index.css:4-5`). Use supplied wordmark art for identity; `Bebas Neue` must not recreate the logo or carry body copy. Heading case can be natural; reserve uppercase for short navigational labels. Body minimum 16px; product title 14–16px on cards; metadata 13–14px. Do not use 8–11px labels to convey required facts. |
| Page frame | Max-width about 1200px; horizontal padding 16px phone, 24px tablet, 32–40px desktop. One spacing scale: 4, 8, 12, 16, 24, 32, 48, 64px. Sections separated by space or a 1px line, not repeated thick frames. Legal text max-width about 70 characters. |
| Surfaces | Ivory/white primary; product images in `#F8F7F3` or white. Border 1px neutral. Radius 4–6px (3px is acceptable for controls); no offset shadows, rotating cards, glass or ornamental texture behind forms. A soft shadow may be used for a floating dialog only. |
| Buttons/links | One ink-filled primary action per decision area; white/ink outlined secondary; text link for tertiary. Minimum 44×44px touch target, 48px recommended for mobile primary. Disabled retains readable label and explanation. Hover changes colour/line subtly, no translation. 2px visible focus outline with offset; reduced motion respected. |
| Inputs/grouped fields | Persistent labels above 48px fields; clear required/optional text, hint beneath, error next to its field and summary when submission fails. Preserve validation, field names, input modes, address privacy prompts, consent and current step data. Never decorate a form with a product photo/background that compromises readability. |
| Tabs/filters | Account tabs retain URL `?tab=` and all four destinations. Selected tab has ink type and underline/neutral filled background. Wall keeps **existing** client search, category, gender, size, condition and Nearby filter; selected values remain visible/removable. Mobile panel is a usable sheet with labelled close, focus management, Escape and scroll restoration. No invented search/sort backend feature. |
| Product cards | 2 columns at 320/390px, 3 at tablet, 4 at desktop when content width allows. Large consistent near-square/4:5 neutral image well; `contain` with 6–8% visual breathing room, never crop a garment's edge. Caption order: title, size/condition/locality, small ₹0 attribute; one truthful availability label if not available. No tape, duplicate “FREE” stamps or moving cards. Full card remains a link to the original slug. Missing image has a dignified text placeholder; long title gets two readable lines and full title in accessible name. |
| Item gallery | Dominant image plus clearly labelled thumbnails; mobile swipe with accessible previous/next buttons and image count. Keep every existing angle and item ID. Desktop: gallery/detail approximately 55/45; mobile: gallery then title, status, ₹0, key facts and primary action before extended guidance. Owner, quota, claimed and processing states replace primary action with an honest disabled/alternative state. |
| Status | Text before colour: Available, Being matched, Claimed, Reloved, Processing, Pending review, Handed over, Received, Failed only when these meanings are confirmed by API. Small inline labels, no multiple stamps. Avoid promising publication, courier booking or delivery from a notification alone. |
| Dialogs/sheets | Use a calm elevated white surface, heading, close button, focus trap/return, scrollable content and a visible action above the mobile keyboard/safe area. Keep claim modal's two-step logic, consent, exact payload and success callback. Existing notice dialogs inherit styling only after shared ownership. |
| Progress/notices/loading | Give step count derives from the **current** guest/signed-in step array, not a new wizard. Skeletons match final geometry without claiming faster loading. Empty is distinct from network failure. Pending, partial bulk upload, expired session, privacy warning and unavailable item have an explicit next action. Error wording belongs to the copy/recovery owner where that branch already covers it. |

### Responsive and accessibility rules

At 320px, no horizontal scroll, truncated required facts or CTA hidden by the on-screen keyboard. At 390px, two cards stay legible; at tablet 768px, filters and gallery reflow without a cramped intermediate layout; at desktop 1440px, imagery gets scale while line lengths stay controlled. Test text zoom to 200%, keyboard through menu/filter/gallery/dialog/forms, visible focus, labels, status without color alone, reduced motion and touch targets. Physical phone and Instagram-browser validation are separate from emulated browser captures.

## Page-family application (all existing pages remain)

| Family | Proposed composition; contracts preserved |
| --- | --- |
| Home, nav, footer | A direct “Give pieces another life / Browse preloved pieces for ₹0” proposition and two obvious routes. One product-first preview; approved brand badge/art in a selected story moment; impact and origin below. Use master wordmark in header with clear space. Preserve every approved nav/footer destination and analytics event. Coordinate header/footer copy and care-phone exposure with recovery owner. |
| Wall and detail | Quiet canvas and grid as above; existing filter logic, URL aliases, status visibility and item identity stay. Detail gallery is uncluttered; keep localized handover facts and one claim action. Help and partner explanations move below the decision area; they remain reachable. |
| Give, success | Keep actual steps, photo groups, item-specific drafts, AI fallback and authentication return. Present one clear task at a time with lightweight progress and a review that distinguishes each item and its photos. Success shows reference and truthful state once publication policy is approved; preserve tracking/account links and item-vs-courier-charge distinction. |
| Account, gift, claim, lifecycle | Account starts with current requests and drops; tabs remain Notifications, Giving, Claiming, Profile. Details open the exact item/claim, with a compact item identity block, current status, next permitted action, then schedule/chat/history. Do not remove valid cancellation, editing, address, receipt, photo or courier actions. Keep login/onboarding visually/behaviorally unchanged until separately coordinated as requested. |
| Tracking, help, Map, Love | Status-focused reference lookup; FAQ/help grouped for scanning; map on quiet surface with area-level privacy and a fallback; Wall of Love uses actual approved item imagery/recognition, not unrelated stock-recipient implication. Preserve existing routes and content until copy approval. |
| About, FAQ, Contact, Standards, Privacy, Terms, Partner, QR | Same typography, spacing, forms and focus system. Preserve legal text, partner application payload, QR destinations and all links. QR images and downloads currently depend on external QRServer; generation color and offline failure need a separate functional check before that page is migrated. Partner login/dashboard and admin are inventoried but outside this public rollout. 404 and `/api/*` redirect remain recovery/ops-owned. |

## Demonstration and migration boundary

The [local static preview](UI_UX_PREVIEW/index.html) illustrates **one** proposed direction at mobile Wall, mobile Give photo step, mobile claim detail, desktop Wall and desktop item detail. It uses the supplied black master wordmark and checked-in Reloved product photos. It is a design artifact only: fixture cards, controls and account status are non-functional. Its offline browser capture uses system fallback type; exact Manrope/Bricolage rendering is an implementation check. The screenshots in `UI_UX_PREVIEW/evidence/` are the current connected app with synthetic read-only fixtures, not the proposed implementation.

Proposed first code slice **after approval and implementation-plan review**: opt-in public tokens/primitives and Wall + item-detail presentation. Preserve `Drop.tsx` filter controller, `ItemDetail.tsx` claim controller, both route aliases, backend API methods/payloads, analytics, owner/non-claimable states and gallery image paths. Characterize high-risk state behavior before extracting views. Do not alter `App.tsx`, global `index.css`, existing shared `Button/Card` defaults, `PublicLayout`, admin, partner or 404 without coordinated ownership. Later slices: Give; account/lifecycle; Home/nav/supporting pages. Unmigrated routes keep current treatment until their slice.

## Approval questions tied to real boundaries

1. **Design:** approve this single visual system and the five static examples, or mark concrete changes in this document. This is the required design gate before application-code changes.
2. **Shared ownership:** confirm the recovery/copy owner will keep `App.tsx`, 404/error wording and shared copy; this UI branch may add scoped public components and edit public page presentation, with `Navbar/Footer/ClaimDetail/GiveDetail` coordinated before their slices. If ownership differs, record it before planning edits.
3. **Policy:** claim limit, required contact/address, delivery cancellation/confirmation, publication, service area and courier charge remain open in the audit ledger. The first Wall/detail slice can proceed by reflecting existing API truth; policy wording changes wait for product approval.

After written design approval, produce a separate dependency-ordered implementation plan with exact files, tests, integration and rollback steps and request plan approval. Only then change application code.

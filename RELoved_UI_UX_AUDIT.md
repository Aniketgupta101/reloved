# RE-LOVED — UI/UX Audit (Read-Only)

Scope: `frontend/src` (public pages, shared UI components, layout, data, lib), `shared/taxonomy.ts`, styling approach (Tailwind v4 via `frontend/src/index.css`). This is a code-reading audit — no visual/browser testing was performed and no code was changed. All improvements below build on the existing design system (the neubrutalist "Wall of Kindness" look: hard black borders, drop shadows, uppercase display type) rather than replacing it.

---

## 1. Current UI assessment

RE-LOVED uses a deliberate **neubrutalist / street-flyer aesthetic**: thick 2px black borders, flat offset drop-shadows (`shadow-[Npx_Npx_0px_rgba(0,0,0,1)]`), no border radius (`rounded-none`), uppercase black display headings (Bricolage Grotesque) over a body sans (Manrope), and a warm off-white "concrete" background. This is applied consistently at the primitive level (`Button`, `Card`, `Input`, `Textarea`, `NoticeModal`) and gives the product a recognizable, on-brand identity that suits the "Wall of Kindness / street wall" concept.

The implementation is functional and largely consistent for read-only display (cards, badges, status tags), but shows clear signs of being built page-by-page under time pressure:
- Interactive form controls (`<select>`, radio/checkbox groups, filter chips, tabs) are hand-rolled per page with long duplicated Tailwind class strings instead of using shared components.
- Native browser dialogs (`window.alert`, `window.confirm`) are still used in some flows even though a bespoke `NoticeModal` exists specifically to "replace window.alert / confirm chrome dialogs" (its own doc comment in `frontend/src/components/ui/NoticeModal.tsx`).
- Labels are visually associated with inputs but not programmatically (`htmlFor`/`id`) almost everywhere except one shared component (`LegalAccept.tsx`), which is a real accessibility gap given how form-heavy the core flows (Give, Claim, Profile, Partner, Contact) are.
- The multi-step Give wizard (`frontend/src/pages/public/Give.tsx`, 1240 lines) and several detail pages carry a lot of inline business logic mixed with markup, which increases the risk of visual drift as the product grows.

Overall: the brand identity is strong and worth keeping; the main opportunity is **consolidating repeated patterns into shared components** and **closing accessibility/consistency gaps**, not redesigning.

---

## 2. Existing design system (as found in code)

### 2.1 Color tokens
Defined once in `frontend/src/index.css` under `@theme` (Tailwind v4 CSS-first config — there is no separate `tailwind.config.js`):

```
--color-background:      #F4F1EA   /* concrete/whitewash off-white page bg */
--color-surface:         #FFFFFF   /* white product surfaces (cards, inputs) */
--color-surface-muted:   #EBE7DF   /* muted panel bg (form summaries, skeletons) */
--color-foreground:      #111111   /* near-black text / borders */
--color-foreground-muted:#595959   /* secondary text */
--color-accent-green:    #BFE53A   /* logo lime green */
--color-accent-blue:     #2A48FF   /* cobalt blue (rarely used in components read) */
--color-accent-red:      #FF4D3E   /* coral / error highlight */
--color-accent-yellow:   #FFDE59   /* tags, "being matched" (rarely used directly) */
--color-accent-pink:     #EC2F9B   /* logo magenta — primary interactive accent */
--color-accent-pink-soft:#F9E0EF   /* light pink wash */
--color-concrete:        #E6E4E0   /* light concrete grey */
--color-border:          #E5E5E5
```
`accent-pink` is the de-facto primary action/highlight color across the app (buttons, active filters, badges, "For You" tags). `accent-green` is used for success/positive states (Reloved, matched, verified). `accent-red` is used for warnings/errors. `accent-blue` and `accent-yellow` are declared but barely used in the pages read — see §11.

### 2.2 Typography
- Display font: `--font-display: "Bricolage Grotesque"` — all headings (`h1`–`h6` forced to `font-weight: 700` in `@layer base`) and most CTA buttons/labels use it in uppercase.
- Body font: `--font-sans: "Manrope"`.
- The Navbar logo wordmark uses a third, hardcoded font (`font-['Bebas_Neue',sans-serif]`, `frontend/src/components/layout/Navbar.tsx:62`) not declared anywhere in the `@theme` token set — a one-off outside the type scale.
- No documented type scale exists (e.g. no `text-h1`/`text-h2` utility aliases); every page reaches for raw Tailwind sizes (`text-4xl`, `text-5xl`, `text-6xl`, `text-7xl`) ad hoc. Sizes are close but not identical across pages doing the same job (e.g. page H1s vary between `text-3xl`/`text-4xl`/`text-5xl md:text-6xl`/`text-5xl md:text-7xl` — Give.tsx L473, Drop.tsx L105, StaticPages.tsx Partner L107, About L478).

### 2.3 Spacing / layout
- No custom spacing scale — plain Tailwind spacing (`gap-4`, `p-6`, `px-4`, etc.).
- Page containers vary between `max-w-2xl`, `max-w-3xl`, `max-w-4xl`, `max-w-5xl`, `max-w-6xl`, `max-w-7xl` per page with no documented rule for which width class a given page type should use (compare `ClaimDetail.tsx` `max-w-2xl` vs `ItemDetail.tsx` `max-w-6xl` vs `Drop.tsx` `max-w-7xl`).
- Card/section shadow depth is inconsistent by literal pixel value rather than a token/scale: `shadow-[2px_2px_0px_...]`, `[3px_3px...]`, `[4px_4px...]`, `[6px_6px...]`, `[8px_8px...]`, `[10px_10px...]`, `[12px_12px...]` all appear as raw arbitrary values scattered across components, e.g. `Button.tsx` (4px), `Card.tsx` (4px), `WallOfKindnessCard.tsx` (5px → 10px on hover), modals in `ItemDetail.tsx`/`ClaimDetail.tsx`/`GiveDetail.tsx` (8px–12px). There's an implicit "bigger container = bigger shadow" convention but it's never formalized.

### 2.4 Core components (the working design system)
- `Button` (`frontend/src/components/ui/Button.tsx`): variants `cta | primary | secondary | outline | ghost`, sizes `default | sm | lg | icon`. Shared border/shadow/hover-press pattern (`hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px]`) is a good, reusable "brutalist press" interaction.
- `Card` / `CardContent` (`frontend/src/components/ui/Card.tsx`): white surface, 2px border, fixed 4px shadow.
- `Input` / `Textarea` (`frontend/src/components/ui/Input.tsx`, `Textarea.tsx`): 2px border, `focus-visible:shadow-[2px_2px_0px_...]` for focus feedback instead of a ring.
- `NoticeModal` (`frontend/src/components/ui/NoticeModal.tsx`): the intended replacement for native `alert`/`confirm`, with `role="dialog" aria-modal aria-labelledby`.
- `WallOfKindnessCard` (`frontend/src/components/ui/WallOfKindnessCard.tsx`): the single canonical item-tile component reused across Home hero grid, Wall of Kindness grid, and Kindness Map sidebar — a good example of the "one component, many surfaces" pattern the rest of the app should follow more.
- `LegalAccept` / `PrivacyBuildingNotice` (`frontend/src/components/ui/LegalAccept.tsx`, `PrivacyBuildingNotice.tsx`): shared legal/privacy blocks reused across Give and Claim — another good consolidation example, and the *only* place in the codebase where `<label htmlFor>` + `id` pairing is used correctly.

What's **missing** from the system (built ad hoc per page instead): `Select`, `RadioCard`/`RadioGroup`, `Checkbox`, `Tabs`/segmented control, `Chip`/filter-pill, `Modal` shell (each modal in `ItemDetail.tsx`, `ClaimDetail.tsx`, `GiveDetail.tsx` reimplements its own overlay/close-button/shadow), `Progress` (the Give wizard's step bar), and `Toast`/inline-alert. See §7.

---

## 3. UX problems

1. **Native `window.alert`/`window.confirm` still gate real actions**, despite a purpose-built `NoticeModal`.
   - Current: `DonorDashboard.tsx` (`handleBookBorzoDirect`, L111–134) uses `window.confirm(...)` to confirm booking a courier and `window.alert(...)` to report success/failure. The "Remove listing" action (L934, L939) also uses `confirm()`/`alert()`.
   - Problem: These are the platform's real, unstyled system dialogs — they break immersion, cannot be styled to match the brand, don't work well on mobile Safari/Chrome, and are inconsistent with the same action (`Book Borzo`) using the styled `NoticeModal` flow on `ClaimDetail.tsx` and `GiveDetail.tsx`.
   - Recommendation: Route these three call sites through the existing `NoticeModal` component (already used for the identical Borzo-booking confirmation elsewhere).
   - Benefit: One consistent, on-brand confirmation pattern app-wide; better mobile behavior.
   - Files: `frontend/src/pages/public/DonorDashboard.tsx` (L111–134, L934–944), reference pattern in `frontend/src/pages/public/ClaimDetail.tsx` (L95–130) and `frontend/src/components/ui/NoticeModal.tsx`.

2. **The Give wizard's step indicator is decorative only, not a real progress signal for assistive tech.**
   - Current: `Give.tsx` L474–478 renders `steps.map(s => <div className="h-1.5 flex-1 ..." />)` — a set of bars with no text label ("Step 2 of 5") and no `role="progressbar"`/`aria-valuenow`.
   - Problem: Screen-reader users get no sense of progress through a 5-step form; sighted users only get a color bar with no numeric context (contrast this with `ItemDetail.tsx`'s `TakeItemModal`, which does print "Step 1 of 2" as text, L513).
   - Recommendation: Add a visually-small "Step X of Y" text label next to/above the bar (matching the pattern already used in `TakeItemModal`) and `role="progressbar"` with `aria-valuenow`/`aria-valuemin`/`aria-valuemax`.
   - Benefit: Users always know how much of the donation form is left — reduces abandonment on a flow that already has 5 steps.
   - Files: `frontend/src/pages/public/Give.tsx` (L472–479).

3. **Give flow does not persist step-by-step (no autosave/local draft).**
   - Current: All wizard state lives in a single `useState(formData)` in `Give.tsx` with no `localStorage`/draft persistence.
   - Problem: A refresh, accidental back-navigation, or crash at step 4/5 (after photo AI analysis, which can take real time) loses everything, including uploaded photos.
   - Recommendation: Persist `formData` (excluding File objects/blobs) to `localStorage` keyed by a draft id, and restore on mount with a "Resume your draft?" prompt.
   - Benefit: Meaningfully reduces drop-off on the highest-friction flow in the product (5 steps + AI photo analysis + address entry).
   - Files: `frontend/src/pages/public/Give.tsx`.

4. **Claim-limit ("weekly claim limit") messaging is inconsistent between pages.**
   - Current: `ItemDetail.tsx` shows "Claims this week: X/Y" (L251–261) and disables the CTA with "Weekly claim limit reached" (L269). `DonorDashboard.tsx` shows the same counter as "Claim requests this week" with a row of check-mark boxes (L387–417). Both are correct but visually unrelated (one is a text pill, the other a token/box row) for the same underlying concept.
   - Recommendation: Extract a single `ClaimQuotaBadge` component used in both places.
   - Benefit: Users see one consistent quota pattern regardless of where they encounter it; less code to keep in sync when the weekly limit changes.
   - Files: `frontend/src/pages/public/ItemDetail.tsx` (L250–261), `frontend/src/pages/public/DonorDashboard.tsx` (L386–418).

5. **"Building/landmark" address entry appears 5+ times with slightly different copy, validation, and warning placement.**
   - Current: Free-text/autocomplete address fields with the same privacy rule (`PrivacyBuildingNotice`/`privacyAddressWarning`) appear in `Give.tsx` (3 branches — receiver_collects, giver_sends, porter_arranged), `ItemDetail.tsx`'s `TakeItemModal`, `ClaimDetail.tsx`, and `DonorDashboard.tsx` profile editing — each with its own copy variant of "no flat or wing."
   - Problem: Any future wording/policy change (e.g. adding a new privacy rule) has to be hunted down and edited in 5+ places; some variants show the warning above the field, others below.
   - Recommendation: Wrap `AddressAutocomplete` + `PrivacyBuildingNotice` + warning text into a single `PrivateAddressField` component with a `mode` prop (pickup / delivery / profile) for copy variants.
   - Benefit: Guaranteed-consistent privacy messaging (this is also a trust/safety feature, not just cosmetic) and much less duplicated code to maintain.
   - Files: `frontend/src/pages/public/Give.tsx` (L907–1043), `frontend/src/pages/public/ItemDetail.tsx` (L527–550), `frontend/src/pages/public/ClaimDetail.tsx` (L265–300), `frontend/src/pages/public/DonorDashboard.tsx` (L682–694), shared: `frontend/src/components/ui/PrivacyBuildingNotice.tsx`, `frontend/src/components/ui/AddressAutocomplete.tsx`.

6. **Empty/loading states are inconsistent in tone and structure across list pages.**
   - Current: `Drop.tsx` has a rich skeleton grid + an illustrated empty state with icon, heading, copy, and CTA (L180–204). `DonorDashboard.tsx`'s "No claims yet"/"Nothing here yet" empty states are plain centered text blocks with no icon (L463–468, L766–769, L886–889). `ClaimDetail.tsx`/`GiveDetail.tsx` loading states are a single pulsing gray box with no skeleton structure (L150–152, L93–95).
   - Recommendation: Define one `EmptyState` component (icon + heading + copy + optional CTA) and one `Skeleton`/`LoadingCard` pattern, and use them everywhere a list can be empty or loading.
   - Benefit: Predictable, polished-feeling loading/empty moments everywhere, not just on the flagship Wall page.
   - Files: `frontend/src/pages/public/Drop.tsx` (L180–204), `frontend/src/pages/public/DonorDashboard.tsx` (L460–468, L765–770, L883–889), `frontend/src/pages/public/ClaimDetail.tsx` (L150–152), `frontend/src/pages/public/GiveDetail.tsx` (L93–95).

7. **Destructive/irreversible actions ("Remove listing") use a plain `confirm()` with no explanation of consequence.**
   - Current: `DonorDashboard.tsx` L934: `if (!confirm("Remove this incomplete listing?")) return`.
   - Recommendation: Use `NoticeModal` with explicit copy on what "remove" means (can it be undone? does it affect a pending claim?).
   - Benefit: Reduces accidental data loss and support tickets from confused users.
   - Files: `frontend/src/pages/public/DonorDashboard.tsx` (L928–944).

8. **The FAQ chat widget's canned-answer matching is keyword-based and can silently mismatch.**
   - Current: `presetAnswer()` in `FloatingHelpButton.tsx` (L39–83) only matches a handful of hardcoded `includes()` keywords; anything else falls through to a generic "please pick a preset question" response, even though six specific preset buttons are offered.
   - Recommendation: Since the six presets are fixed buttons (not free text), route each preset button directly to its matching `FaqItem` by key/id instead of re-parsing the button's own label as free text through keyword matching — this removes a whole class of "preset button gives generic fallback" bugs.
   - Benefit: The help widget reliably answers the exact six questions it advertises.
   - Files: `frontend/src/components/sections/FloatingHelpButton.tsx` (L30–99).

---

## 4. Visual problems

1. **Hardcoded one-off font bypasses the type system.**
   - Current: Navbar wordmark uses `font-['Bebas_Neue',sans-serif]` (`Navbar.tsx` L62) — a third typeface never declared in `--font-display`/`--font-sans` tokens, and not loaded via any visible `<link>`/`@font-face` in the files read (risk of silent fallback to system sans if "Bebas Neue" isn't actually loaded anywhere).
   - Recommendation: Either promote "Bebas Neue" to a proper `--font-logo` token (with a confirmed font-loading strategy) or set the wordmark in `--font-display` (Bricolage Grotesque) to match the rest of the brand type.
   - Benefit: Guarantees the logo font actually loads and ties the wordmark back into the documented type system.
   - Files: `frontend/src/components/layout/Navbar.tsx` (L62), `frontend/src/index.css` (`@theme` block).

2. **Shadow depth is set by literal pixel values, not a scale — small drift is already visible.**
   - Current: Nearly identical UI elements (modals across `ItemDetail.tsx`, `ClaimDetail.tsx`, `GiveDetail.tsx`) use different shadow depths (`8px`, `12px`) for what is conceptually "the same modal component" done three separate times.
   - Recommendation: Define 3–4 shadow tokens (e.g. `--shadow-sm/md/lg/xl` mapped to the existing 2/4/8/12px values already in use) and reference them via a small set of utility classes, so every "modal," "card," "hero card" reliably gets the same depth.
   - Benefit: Visual depth stays predictable as new screens are added; no more per-page guessing at "was it 8px or 12px here."
   - Files: `frontend/src/index.css` (`@theme`), all modal implementations in `frontend/src/pages/public/ItemDetail.tsx`, `ClaimDetail.tsx`, `GiveDetail.tsx`.

3. **Status/tag color usage is not fully systematic.**
   - Current: "Being Matched"/"Reloved"/"For You" tags all reuse `accent-pink` (`WallOfKindnessCard.tsx` L41–61), while `accent-yellow` (declared for "tags, being-matched" per its own code comment in `index.css` L17) and `accent-blue` are essentially unused in the pages read. Meanwhile the Kindness Map (`KindnessMap.tsx` L181–186) uses a *different* 3-color mapping for the same lifecycle states (`accent-green` = available, `accent-yellow` = being_matched, `accent-pink` = claimed).
   - Problem: A user could see "being matched" rendered in pink on an item card and in yellow on the map for the same underlying status, with no shared legend.
   - Recommendation: Define one status→color mapping (e.g. a `STATUS_TONE` map in `shared/`) and use it in both `WallOfKindnessCard.tsx` and `KindnessMap.tsx`.
   - Benefit: A user learns "yellow = being matched" once and it holds everywhere, including the map legend already using it correctly.
   - Files: `frontend/src/components/ui/WallOfKindnessCard.tsx` (L36–62), `frontend/src/components/sections/KindnessMap.tsx` (L181–186), token source `frontend/src/index.css` (L14–19).

4. **Long uppercase tracking-widest labels wrap awkwardly at small tile sizes.**
   - Current: `WallOfKindnessCard.tsx` already hand-manages a `sm:hidden`/`hidden sm:inline` short-vs-long label split for its corner tag (L113–116) — evidence the team already found wrapping problems at 2-column mobile grid width, but this workaround exists in only one component.
   - Recommendation: Formalize a `shortLabel` convention (already prototyped here) as a documented pattern for any future badge/tag component, rather than re-discovering it per component.
   - Benefit: Prevents the same "text overflows a 2-column mobile card" bug from resurfacing in the next badge added.
   - Files: `frontend/src/components/ui/WallOfKindnessCard.tsx` (L108–117).

5. **Inline `<select>` elements don't match the visual weight of `Input`/`Button`.**
   - Current: Every hand-rolled `<select>` (category, gender, condition in `Give.tsx`; org type/registration in `StaticPages.tsx` Partner form; decline-reason in `GiveDetail.tsx`) uses a long inconsistent className string, several including leftover shadcn/ui utility classes that don't exist in this Tailwind v4 setup (e.g. `ring-offset-background`, `focus-visible:ring-ring`, `file:border-0` — these are ignored no-ops here since no such tokens/utilities are defined), and no visible dropdown caret/affordance is added.
   - Recommendation: Build one `Select` primitive (same visual language as `Input`: 2px border, `focus-visible:shadow-[2px_2px_0px_...]`) and replace all raw `<select>` usages.
   - Benefit: Removes dead/no-op utility classes, guarantees selects look and behave like every other form control, and gives every dropdown a consistent affordance.
   - Files: `frontend/src/pages/public/Give.tsx` (L624–632, L649–654, L664–669, L677–683, L698–707, L845–850), `frontend/src/pages/public/StaticPages.tsx` (L139–150, L157–166), `frontend/src/pages/public/GiveDetail.tsx` (L272–281).

---

## 5. Mobile problems

1. **Horizontal filter rows rely on `overflow-x-auto` with only a visual fade hint, no scroll affordance for accessibility.**
   - Current: `Drop.tsx` category/gender filter rows (L122–176) scroll horizontally with `scrollbar-hide` (native scrollbar hidden globally via `frontend/src/index.css` L73–80) and a `pointer-events-none` gradient fade on the right edge to hint "more content." There's no visible scroll indicator for users who don't intuit swipe-to-scroll, and hidden scrollbars remove a normal discoverability cue especially for non-touch/assistive users.
   - Recommendation: Keep the fade but also consider small leading/trailing chevron affordances on wider mobile widths, and never hide scrollbars for keyboard-navigable regions without another indicator.
   - Benefit: Fewer users miss categories that are scrolled off-screen (e.g. "Accessories" as the last chip).
   - Files: `frontend/src/pages/public/Drop.tsx` (L121–176), `frontend/src/index.css` (L73–80, `.scrollbar-hide`).

2. **Give wizard's fixed-height card (`min-h-[500px]`) plus a sticky mobile keyboard can push the footer nav off-screen.**
   - Current: `Give.tsx` L481 sets `min-h-[500px] flex flex-col` on the step container, and the Back/Continue footer sits at the bottom of that same flex column (L1215–1236). On a small phone with the on-screen keyboard open (e.g. typing pincode/description), the fixed min-height plus keyboard can force the Continue button below the visible viewport, especially for step 4's several stacked fields.
   - Recommendation: Verify actual behavior on a real small-viewport device (this is a code-reading audit, not a live test) and consider making the footer `sticky bottom-0` with a solid background so it's always reachable while scrolling within a step.
   - Benefit: The primary "Continue"/"Submit" action stays reachable on small phones with the keyboard open — a top drop-off risk if it currently isn't.
   - Files: `frontend/src/pages/public/Give.tsx` (L481, L1215–1236).

3. **Modals are not scroll-locked on the body, and some (but not all) modals scroll internally.**
   - Current: `ItemDetail.tsx`'s `TakeItemModal`/`HelpModal` add `overflow-y-auto` to the modal's fixed backdrop wrapper (L499, L641) and `my-8` on the inner panel, but body scroll is not locked (compare to `Navbar.tsx`'s mobile menu, which does lock body scroll via `document.body.style.overflow = "hidden"`, L21–28). On a long modal (e.g. Partner explainer, Take Item step 2 with Legal text), background page content can scroll behind/along with the modal on some mobile browsers, which is disorienting.
   - Recommendation: Apply the same body-scroll-lock pattern already implemented in `Navbar.tsx` to every full-screen modal.
   - Benefit: Consistent, predictable modal behavior on mobile — no background bleed-through scrolling.
   - Files: `frontend/src/pages/public/ItemDetail.tsx` (multiple modals, L302–408, L413–609, L611–708), `frontend/src/pages/public/ClaimDetail.tsx`/`GiveDetail.tsx` (`NoticeModal` usages), reference pattern: `frontend/src/components/layout/Navbar.tsx` (L21–28).

4. **`FloatingHelpButton` and other fixed-position elements can visually stack/collide.**
   - Current: The help FAB sits at `fixed bottom-5 right-5` (L210–223) and its open panel at `fixed bottom-24 right-5` (L144). `PublicLayout.tsx` already hides the FAB on `/faq`, `/account*`, `/give*`, `/contact`, `/partner/login` "where the FAB covers primary actions on mobile" (L18–24) — a good instinct, but this is a growing manual allow/deny-list rather than a general collision-avoidance rule, so any new full-height mobile form added later has to remember to opt out too.
   - Recommendation: Consider a more general rule (e.g. auto-hide the FAB whenever a modal/sheet is open, tracked via a shared context) instead of a per-route list that must be manually kept in sync with new pages.
   - Benefit: Removes a class of "forgot to hide the FAB on the new page" bugs.
   - Files: `frontend/src/components/layout/PublicLayout.tsx` (L18–24), `frontend/src/components/sections/FloatingHelpButton.tsx`.

5. **Two-column stat/tab grids compress badge counts into very small tap targets on narrow phones.**
   - Current: `DonorDashboard.tsx`'s tab bar is `grid-cols-2 sm:grid-cols-4` with a `min-w-5 h-5` badge overlaid at `text-[10px]` (L356–384); the tab buttons are `h-12` with `text-[10px] sm:text-xs` labels — functional, but four 2-word/1-word tab labels stacked two-per-row on a ~360px-wide phone leaves each tab quite cramped, especially with a badge overlapping the corner.
   - Recommendation: Consider a horizontally-scrollable single-row tab strip on narrow widths instead of a 2×2 grid, matching the horizontal-scroll pattern already used for Drop.tsx's category chips.
   - Benefit: More breathing room per tab label and badge on the smallest supported phones.
   - Files: `frontend/src/pages/public/DonorDashboard.tsx` (L356–384).

---

## 6. Accessibility issues

1. **Form labels are not programmatically associated with their inputs almost anywhere except `LegalAccept.tsx`.**
   - Current: A repo-wide search for `htmlFor=` returns matches in exactly one file (`frontend/src/components/ui/LegalAccept.tsx`, 3 occurrences). Every other `<label>` across the app — `Give.tsx` (dozens, e.g. L617, L623, L636, L660, L673, L690, L722, L726, L732, L737, L754, L758, L765, L770, L833), `StaticPages.tsx` Partner/Contact forms (e.g. L127, L138, L156, L170...), `DonorDashboard.tsx` profile form (L567, L571, L583, L602, L644, L683, L697), and modal forms in `ItemDetail.tsx` (L520, L524, L528, L552, L676, L680, L684, L688) — is a plain `<label>` with no `htmlFor`, paired with an `Input`/`Textarea`/`select` that has no matching `id`.
   - Problem: Screen readers cannot announce "Item Title, edit text" when focus lands in that field — only the bare input role, with no accessible name. This affects every required field in the two most important flows in the product (Give and Claim).
   - Recommendation: Add `id`/`htmlFor` pairs across all forms (a small, mechanical, low-risk fix now that `LegalAccept.tsx` already shows the correct pattern to copy), or move to wrapping `<label>` around the control (which also works without `htmlFor`, and is used correctly for the checkbox/radio rows in `Give.tsx` L778–814 and `LegalAccept.tsx` — but not for the `Input`/`select`/`Textarea` pairs, which use sibling `<label>` + control instead of wrapping).
   - Benefit: Screen-reader users can actually use the Give/Claim/Profile/Partner/Contact forms — currently a significant, concrete accessibility barrier, not a nice-to-have.
   - Files: `frontend/src/pages/public/Give.tsx`, `frontend/src/pages/public/StaticPages.tsx` (Partner, Contact), `frontend/src/pages/public/DonorDashboard.tsx`, `frontend/src/pages/public/ItemDetail.tsx` (`TakeItemModal`, `HelpModal`), `frontend/src/pages/public/GiveDetail.tsx` (decline-reason select, L271).

2. **Custom interactive chips/tabs/toggles have no visible focus style distinct from hover.**
   - Current: A repo-wide search for `focus-visible`/`focus:` returns usage in only 7 files, and none of them are the category/gender filter chips (`Drop.tsx` L126–141, L152–169), the single/bulk upload-mode toggle (`Give.tsx` L497–518), the date/time preset buttons (`Give.tsx` L946–958, L965–976), the giving/claiming tab bar (`DonorDashboard.tsx` L356–384), or the gender picker buttons in the profile form (`DonorDashboard.tsx` L585–597) — all of which are plain `<button>` elements styled only for hover/active state.
   - Problem: Keyboard users tabbing through these controls get only the browser's default focus ring (inconsistent across browsers, and can be visually lost against the 2px black border already on every chip), with no deliberate on-brand focus treatment the way `Input`/`Textarea` have (`focus-visible:shadow-[2px_2px_0px_...]`).
   - Recommendation: Apply the same `focus-visible:shadow-[2px_2px_0px_rgba(0,0,0,1)]` (or an offset ring in `accent-pink`) treatment already used on `Input`/`Textarea` to every custom button/chip/tab.
   - Benefit: Consistent, on-brand, clearly-visible keyboard focus everywhere, closing a real WCAG 2.4.7 (Focus Visible) gap.
   - Files: `frontend/src/pages/public/Drop.tsx`, `frontend/src/pages/public/Give.tsx`, `frontend/src/pages/public/DonorDashboard.tsx`, reference pattern: `frontend/src/components/ui/Input.tsx`, `Textarea.tsx`.

3. **`AddressAutocomplete`'s suggestion list has no ARIA combobox semantics or keyboard navigation.**
   - Current: `AddressAutocomplete.tsx` renders a plain `<ul>`/`<button>` dropdown (L203–219) with no `role="combobox"`/`aria-expanded`/`aria-controls`/`aria-activedescendant` on the input, and no arrow-key navigation — only mouse `onClick`/`onMouseDown` handlers select a suggestion.
   - Problem: This component is the address-entry mechanism for nearly every critical flow (Give pickup address, Claim delivery address, Donor profile address) and is currently unusable via keyboard for selecting a suggestion — a keyboard-only user can type but cannot arrow-down into and select a result, only tab past the whole widget.
   - Recommendation: Add standard combobox ARIA attributes and arrow-key/Enter selection handling.
   - Benefit: Keyboard-only users (and screen-reader users generally) can complete address entry on Give/Claim without a mouse — currently likely impossible.
   - Files: `frontend/src/components/ui/AddressAutocomplete.tsx` (L193–223).

4. **Decorative icons are not consistently marked `aria-hidden`.**
   - Current: Some icons are correctly hidden from assistive tech (e.g. `PrivacyBuildingNotice.tsx` L10 `aria-hidden` on `AlertTriangle`; `WallOfKindness.tsx`/`SectionBackdrop.tsx`/`CourtyardWallBackground.tsx` use `aria-hidden` per the earlier `alt=""` grep), but many purely decorative `lucide-react` icons inside buttons that already have visible text (e.g. `HeartHandshake` in `Drop.tsx` L101, `Sparkles` in `Give.tsx` L536/L552/L573, `ShieldCheck` in `ItemDetail.tsx` L387) are not marked `aria-hidden`, so screen readers may announce redundant icon semantics alongside the adjacent visible label.
   - Recommendation: Add `aria-hidden="true"` to icons that sit next to their own text label (keep it off icon-only buttons, which already correctly use `aria-label` in most places, e.g. `ItemDetail.tsx` L139/147/158, `KindnessMap.tsx`'s close button).
   - Benefit: Cleaner, less redundant screen-reader announcements throughout the app.
   - Files: widespread — `frontend/src/pages/public/Drop.tsx`, `Give.tsx`, `ItemDetail.tsx`, and others using `lucide-react` icons next to text.

5. **Status/tone is communicated by color alone in a few places.**
   - Current: In `ClaimDetail.tsx` (L202–209) both "approved" and "rejected" claim badges fall through to visually similar pink-toned classes (`bg-accent-green/20 text-accent-green` vs `bg-accent-pink/10 text-accent-pink` for both rejected and default) — the code comment/ternary even collapses `rejected` and the default case to the same class, meaning color is the only differentiator and it's already ambiguous in the source. Text labels are present (`statusLabel`) which mitigates this for sighted users reading the text, but the badge color coding itself is not reliably meaningful.
   - Recommendation: Give each of pending/approved/rejected a genuinely distinct token (not just green vs. "pink for everything else"), and confirm/keep the accompanying text label (already present) as the primary signal, with color as reinforcement only.
   - Benefit: Removes an actually-buggy piece of conditional styling (rejected and pending currently render identically) and improves colorblind-safe status scanning.
   - Files: `frontend/src/pages/public/ClaimDetail.tsx` (L202–209).

6. **Modal close buttons are icon-only but consistently labeled — good, but the pattern isn't shared.**
   - Current: Every modal reimplements its own `<button aria-label="Close">` with the same `X` icon and classes (`ItemDetail.tsx` L318–323, L362–367, L501–506, L643–648; `NoticeModal.tsx` L38–45). This is *accessible* today (all have `aria-label`) but is 100% duplicated markup with no shared `Modal`/`ModalClose` component, so a future modal added without copy-pasting carefully could easily miss the `aria-label`.
   - Recommendation: Extract a shared `Modal` shell (backdrop + panel + close button) so the accessible close button is inherited for free, not re-typed.
   - Benefit: Removes duplicated code and guarantees future modals stay accessible without relying on developers remembering to add `aria-label` every time.
   - Files: `frontend/src/pages/public/ItemDetail.tsx`, `frontend/src/components/ui/NoticeModal.tsx`.

---

## 7. Inconsistent components

1. **No shared `Select` component** — every `<select>` is hand-styled inline with slightly different heights (`h-10` in `Give.tsx`/`StaticPages.tsx` vs `h-11` in `GiveDetail.tsx` vs `h-12` in `Give.tsx`'s handover-option select, L845) and some retain dead shadcn-style utility classes that do nothing in this Tailwind v4 setup (`ring-offset-background`, `focus-visible:ring-ring`, `file:border-0`, `placeholder:text-muted-foreground` — none of these tokens/variants exist here). See §4.5 and §6.1 file lists.

2. **`Input`/`Textarea` usages frequently re-declare classes the component already applies.**
   - Current: Dozens of call sites pass `className="rounded-none border-2 border-foreground"` into `<Input>`/`<Textarea>` (e.g. every field in `Give.tsx`, `ItemDetail.tsx`'s modals, `StaticPages.tsx`, `DonorDashboard.tsx`) even though `Input.tsx`/`Textarea.tsx` already bake in `rounded-none border-2 border-foreground` by default (`Input.tsx` L12, `Textarea.tsx` L11).
   - Problem: Purely redundant, harmless today, but it means the *actual* visual contract of `Input`/`Textarea` is unclear from call sites (a future change to the base border style would need to also be hunted down in every override), and it's a sign these components' true "default-is-enough" contract isn't understood/trusted by whoever wrote each page.
   - Recommendation: Drop the redundant className overrides at call sites; treat `Input`/`Textarea` defaults as the single source of truth.
   - Benefit: Smaller, clearer call sites; a future border/radius tweak only needs to happen in one file.
   - Files: `frontend/src/pages/public/Give.tsx`, `ItemDetail.tsx`, `StaticPages.tsx`, `DonorDashboard.tsx`, `ClaimDetail.tsx` (all `<Input .../>`/`<Textarea .../>` call sites).

3. **No shared `RadioCard`/`RadioGroup` component** — the "Wall of Love Recognition" radio rows are built inline in `Give.tsx` (L778–814) and then near-duplicated again for the "review" step of the same form (L1136–1166) instead of being one reusable sub-component parameterized by state.

4. **No shared `Chip`/filter-pill component** — category chips (`Drop.tsx` L126–141), gender chips (`Drop.tsx` L152–169), upload-mode toggle (`Give.tsx` L497–518), date/time presets (`Give.tsx` L946–976), category-toggle chips in the Partner form (`StaticPages.tsx` L254–271), and profile "Clothes for" chips (`DonorDashboard.tsx` L585–597) are all separately-implemented two-state (active/inactive) pill buttons with near-identical but not identical class strings (some use `bg-accent-pink`, some `bg-foreground text-background`, some `bg-foreground text-white` — see §7.6 below).

5. **No shared `Modal` shell** — see §6.6. Four+ independent implementations of "fixed inset-0 backdrop + white bordered panel + absolute-positioned close button" exist (`ItemDetail.tsx` ×3, `NoticeModal.tsx`).

6. **Ad hoc text-color inconsistency: `text-white` vs `text-background` used interchangeably.**
   - Current: Both resolve to visually similar (white-ish) results today, but some components use the semantic token (`text-background`, e.g. `Button.tsx` L16 `cta` variant, `Navbar.tsx` L98) while others hardcode `text-white` for what is conceptually the same "light text on a dark/foreground surface" (e.g. `StaticPages.tsx` Partner category-toggle active state, L263: `bg-foreground text-white`; `Footer.tsx` uses `text-white` throughout since the whole footer is a dark surface, which is more defensible as a one-off dark section).
   - Recommendation: Standardize on the semantic `background`/`foreground` tokens wherever the surface is meant to track the theme, reserving raw `text-white` for truly fixed-dark surfaces like the footer.
   - Benefit: If `--color-background` or `--color-foreground` values are ever adjusted, every "inverted text" spot stays correct automatically.
   - Files: `frontend/src/pages/public/StaticPages.tsx` (L263), spot-check similar patterns across `frontend/src/pages/public/*.tsx`.

7. **Two components named "WallOfKindness" with different responsibilities live in different folders.**
   - Current: `frontend/src/components/ui/WallOfKindness.tsx` (the grid renderer, takes `items`) and `frontend/src/components/sections/WallOfKindness.tsx` (the homepage section wrapper, exported as `WallOfKindnessSection` — good, it does rename on export) sit side by side with the same base filename in different directories.
   - Problem: Purely a developer-experience/maintainability issue (easy to open the wrong file, harder to grep/find), not a runtime bug since one is properly renamed on export.
   - Recommendation: Rename the file (not just the export) of the section wrapper to `WallOfKindnessSection.tsx` to match its export name, consistent with how every other file in `components/sections/` is named after its export.
   - Benefit: Faster file navigation, avoids future accidental edits to the wrong file.
   - Files: `frontend/src/components/sections/WallOfKindness.tsx`, `frontend/src/components/ui/WallOfKindness.tsx`.

---

## 8. High-impact improvements

1. **Fix label/input association app-wide (§6.1).** Mechanical, low-risk, and unblocks screen-reader use of the two most important flows (Give, Claim) plus Profile/Partner/Contact. This is the single highest-leverage accessibility fix in the codebase.
   - Files: `frontend/src/pages/public/Give.tsx`, `StaticPages.tsx`, `DonorDashboard.tsx`, `ItemDetail.tsx`, `GiveDetail.tsx`.

2. **Replace remaining `window.alert`/`window.confirm` with `NoticeModal` (§3.1, §3.7).** The styled replacement already exists and is already used for the *same* Borzo-booking action elsewhere — this is finishing a migration that's already ~80% done, not starting a new pattern.
   - Files: `frontend/src/pages/public/DonorDashboard.tsx`.

3. **Add keyboard support + ARIA combobox semantics to `AddressAutocomplete` (§6.3).** This single component gatekeeps address entry on Give, Claim, and Profile — fixing it once fixes accessibility for three critical flows simultaneously.
   - Files: `frontend/src/components/ui/AddressAutocomplete.tsx`.

4. **Build the missing `Select` primitive and swap in every raw `<select>` (§4.5, §7.1).** Removes dead no-op utility classes, fixes visual-weight mismatches with `Input`, and is a template for consolidating the other missing primitives (Chip, RadioCard, Modal).
   - Files: `frontend/src/pages/public/Give.tsx`, `StaticPages.tsx`, `GiveDetail.tsx`.

5. **Add draft-persistence to the Give wizard (§3.3).** Give is the core "supply" flow for the whole product; losing a half-filled 5-step form (especially after paying the cost of AI photo analysis) is a plausible, high-cost abandonment point.
   - Files: `frontend/src/pages/public/Give.tsx`.

6. **Give the multi-step wizard a real, labeled progress indicator (§3.2).** Small change, meaningfully improves perceived flow length and accessibility together.
   - Files: `frontend/src/pages/public/Give.tsx`.

---

## 9. Medium-priority improvements

1. Extract a shared `PrivateAddressField` (autocomplete + privacy notice + warning) to guarantee consistent privacy messaging (§3.5). Files: `Give.tsx`, `ItemDetail.tsx`, `ClaimDetail.tsx`, `DonorDashboard.tsx`.
2. Extract a shared `Modal` shell to deduplicate the 4+ hand-rolled overlay implementations and guarantee accessible close buttons by default (§6.6, §7.5). Files: `ItemDetail.tsx`, `NoticeModal.tsx`.
3. Extract a shared `Chip`/toggle-pill component to unify category filters, gender filters, upload-mode toggle, date/time presets, and profile "clothes for" buttons under one implementation (§7.4). Files: `Drop.tsx`, `Give.tsx`, `DonorDashboard.tsx`, `StaticPages.tsx`.
4. Unify the status→color mapping between `WallOfKindnessCard.tsx` and `KindnessMap.tsx` (§4.3). Files: `WallOfKindnessCard.tsx`, `KindnessMap.tsx`, plus a new shared constant (e.g. in `shared/taxonomy.ts` or a new `shared/statusTone.ts`).
5. Define a small shadow-depth token scale and apply it consistently to modals/cards instead of ad hoc pixel values (§4.2). Files: `frontend/src/index.css`, all modal/card call sites.
6. Add a shared `EmptyState` and `Skeleton`/`LoadingCard` component and apply to `DonorDashboard.tsx`, `ClaimDetail.tsx`, `GiveDetail.tsx` to match the polish already present on `Drop.tsx` (§3.6). Files listed there.
7. Add body-scroll lock to every full-screen modal, reusing the pattern already implemented in `Navbar.tsx`'s mobile menu (§5.3). Files: `ItemDetail.tsx`, `ClaimDetail.tsx`, `GiveDetail.tsx`.
8. Add `focus-visible` styling to custom chips/tabs/toggles, reusing the treatment already on `Input`/`Textarea` (§6.2).
9. Route the FAQ chat widget's fixed preset buttons directly to their `FaqItem` instead of re-parsing button labels through keyword matching (§3.8). Files: `FloatingHelpButton.tsx`.
10. Extract a single `ClaimQuotaBadge` component reused by `ItemDetail.tsx` and `DonorDashboard.tsx` (§3.4).

---

## 10. Low-priority polish

1. Rename `frontend/src/components/sections/WallOfKindness.tsx` to `WallOfKindnessSection.tsx` to match its export and sibling file-naming convention (§7.7).
2. Standardize `text-white` vs `text-background` usage per §7.6, reserving `text-white` for genuinely fixed-dark surfaces like `Footer.tsx`.
3. Promote the Navbar's hardcoded `Bebas Neue` wordmark font into a documented token (or fold it into the existing `--font-display`) and confirm the font is actually being loaded (§4.1).
4. Add `aria-hidden="true"` to decorative icons that sit beside their own visible text label, to reduce redundant screen-reader chatter (§6.4).
5. Remove the redundant `className="rounded-none border-2 border-foreground"` overrides on `Input`/`Textarea` call sites that just restate the component's own defaults (§7.2).
6. Consider small leading/trailing scroll-hint chevrons on the horizontally-scrolling filter rows in `Drop.tsx`, in addition to the existing edge fade (§5.1).
7. Fix the `ClaimDetail.tsx` badge ternary so "rejected" and the (currently identical) default case render visually distinct tones rather than duplicating the pink-on-pink styling (§6.5).

---

## 11. Recommended design-system changes (build on existing tokens — no new palette/replacement)

These are additive/organizational changes only. Nothing here proposes a new color, gradient, animation, or component library — every recommendation reuses the existing `@theme` tokens and the existing neubrutalist visual language already defined in `frontend/src/index.css` and `frontend/src/components/ui/Button.tsx`/`Card.tsx`/`Input.tsx`.

1. **Add a small shadow-depth scale on top of the existing tokens**, e.g.:
   ```css
   --shadow-sm: 2px 2px 0px rgba(0,0,0,1);
   --shadow-md: 4px 4px 0px rgba(0,0,0,1);
   --shadow-lg: 8px 8px 0px rgba(0,0,0,1);
   --shadow-xl: 12px 12px 0px rgba(0,0,0,1);
   ```
   These are the exact values already in use across the codebase today (§2.3) — this just names the four depths that already exist so components/pages reference a scale instead of retyping pixel values.
   File: `frontend/src/index.css`.

2. **Formalize a `STATUS_TONE` map** using the *existing* accent colors (green/yellow/pink already declared in `index.css`, and already correctly used together on `KindnessMap.tsx`) so `available` / `being_matched` / `claimed` / `reloved` map to one consistent color everywhere (§4.3, §9.4), instead of `WallOfKindnessCard.tsx` using pink for everything non-available.
   Files: new small module (e.g. `shared/statusTone.ts`), consumed by `WallOfKindnessCard.tsx` and `KindnessMap.tsx`.

3. **Add the missing primitives using the same recipe as existing ones** — every new component (`Select`, `Chip`, `RadioCard`, `Modal`) should be built by literally copying the established recipe already proven in `Button.tsx`/`Card.tsx`/`Input.tsx`: `border-2 border-foreground`, `rounded-none`, a shadow token from #1, and (for interactive elements) the same `hover:shadow-none hover:translate-x-[Npx] hover:translate-y-[Npx]` press interaction already used on `Button.tsx` and the category chips in `Drop.tsx`. No new visual language needed — just applying the current one through reusable components instead of copy-pasted class strings.
   Files: new components under `frontend/src/components/ui/`.

4. **Document the type scale that's already implicitly in use** (e.g. a short comment block or table in `index.css` noting "page H1 = `text-4xl md:text-6xl`", "section H2 = `text-2xl md:text-3xl`", etc.) so future pages pick from the existing sizes already used across `Give.tsx`/`Drop.tsx`/`StaticPages.tsx` rather than introducing new one-off combinations. This does not change any current visual size — it only writes down the convention that's already mostly followed.
   File: `frontend/src/index.css` (comment/documentation only).

5. **Document the container-width convention** (e.g. "single-record detail pages use `max-w-2xl`, catalog/browse pages use `max-w-7xl`, form pages use `max-w-2xl`–`max-w-4xl`") based on the pattern already mostly followed (§2.3), so new pages don't have to guess.

---

## 12. Page-by-page improvement plan

### `frontend/src/pages/public/Give.tsx` (donation wizard)
- Add `id`/`htmlFor` to every field (§6.1).
- Add a labeled, `role="progressbar"` step indicator (§3.2).
- Persist wizard state as a draft in `localStorage` (§3.3).
- Replace raw `<select>`s with the new `Select` primitive (§4.5, §7.1).
- Extract the duplicated "Wall of Love Recognition" radio block used at both step 3 and the review step into one `RadioCard` sub-component (§7.3).
- Extract the three "building/landmark" address blocks into `PrivateAddressField` (§3.5).
- Remove redundant `rounded-none border-2 border-foreground` overrides on `Input`/`Textarea` (§7.2).

### `frontend/src/pages/public/Drop.tsx` (Wall of Kindness browse)
- Add `focus-visible` styling to category/gender filter chips (§6.2).
- Extract filter chips into the shared `Chip` component (§7.4, §9.3).
- Consider scroll-hint affordances beyond the edge fade (§5.1).
- Already has the best empty/loading state in the app (§3.6) — use as the reference pattern for other pages, not a fix target itself.

### `frontend/src/pages/public/ItemDetail.tsx` (item page + Take/Help/Partner modals)
- Extract the three inline modals into the shared `Modal` shell (§6.6, §7.5, §9.2).
- Add `id`/`htmlFor` in `TakeItemModal` and `HelpModal` forms (§6.1).
- Reuse `ClaimQuotaBadge` for the "Claims this week" pill (§3.4, §9.10).
- Mark adjacent-to-text decorative icons `aria-hidden` (§6.4).

### `frontend/src/pages/public/GiveDetail.tsx` / `ClaimDetail.tsx` (post-match handover)
- Replace the plain pulsing-box loading state with the shared `Skeleton`/`LoadingCard` pattern (§3.6, §9.6).
- Add body-scroll lock when `NoticeModal` is open (§5.3, §9.7).
- Fix the `ClaimDetail.tsx` badge tone collision between "rejected" and default (§6.5, §10.7).
- Replace the raw decline-reason `<select>` in `GiveDetail.tsx` with the new `Select` primitive (§4.5).

### `frontend/src/pages/public/DonorDashboard.tsx` (account: notifications/giving/claiming/profile)
- Replace `window.alert`/`window.confirm` with `NoticeModal` (§3.1, §3.7, §8.2).
- Add `id`/`htmlFor` to the profile edit form (§6.1).
- Consider a horizontally-scrolling single-row tab strip on narrow phones instead of a 2×2 grid (§5.5).
- Reuse `ClaimQuotaBadge` for the "Claim requests this week" block (§3.4).
- Add `EmptyState` component to the three empty-list moments (§3.6, §9.6).

### `frontend/src/pages/public/StaticPages.tsx` (Partner, Contact, About, Standards, Privacy, Faq, Terms)
- Add `id`/`htmlFor` to the Partner and Contact forms (§6.1).
- Replace raw `<select>`s (org type, registration status) with the `Select` primitive (§4.5).
- Extract the category-toggle chip row (Partner form) into the shared `Chip` component and standardize `text-white`→`text-background` (§7.4, §7.6).

### `frontend/src/components/sections/KindnessMap.tsx` / `frontend/src/components/ui/WallOfKindness.tsx` / `WallOfKindnessCard.tsx` (Wall of Kindness + map)
- Unify status→color mapping via a shared `STATUS_TONE` map (§4.3, §9.4, §11.2).
- Rename the sections-level `WallOfKindness.tsx` file to `WallOfKindnessSection.tsx` (§7.7, §10.1).
- No changes needed to `WallOfKindnessCard.tsx`'s card visuals — it's the best-consolidated component in the codebase and should be the template for extracting the other missing primitives (§11.3).

### `frontend/src/components/sections/FloatingHelpButton.tsx`
- Route preset buttons directly to their `FaqItem` instead of re-matching keywords (§3.8, §9.9).
- Consider a general "auto-hide when a modal/sheet is open" rule instead of the growing manual per-route hide-list in `PublicLayout.tsx` (§5.4).

### `frontend/src/components/ui/AddressAutocomplete.tsx`
- Add ARIA combobox semantics and keyboard navigation (§6.3, §8.3) — highest-leverage single-file accessibility fix, since this component is reused across Give, Claim, and Profile.

### `frontend/src/components/layout/Navbar.tsx` / `Footer.tsx` / `PublicLayout.tsx`
- Resolve the hardcoded `Bebas Neue` wordmark font vs. the documented `--font-display` token (§4.1, §10.3).
- No structural changes recommended to `PublicLayout.tsx`'s courtyard-background/help-button logic beyond §5.4 — the scroll-to-top, body-scroll-lock (mobile menu), and responsive nav-collapse behavior are already solid and should be treated as reference patterns for other pages.

---

*This audit is based entirely on static code reading of the files listed above (`frontend/src/**`, `shared/taxonomy.ts`). No browser/visual testing, no Lighthouse/axe automated scan, and no design-file comparison were performed. Line numbers reference the file states at the time of this audit and may drift as the code changes.*

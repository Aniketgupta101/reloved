---
name: ui-responsive-audit
description: Audit this app's UI/UX across desktop and mobile viewports and aspect ratios like a senior UI/UX designer + frontend engineer would — catching layout breaks, overflow, clipped content, tiny tap targets, distorted images, unsafe-area/notch collisions, orientation bugs, and general design-quality regressions before they ship. Use this whenever the user asks to "audit the UI", "check responsiveness", "review layout on mobile/desktop", "check breakpoints", "make sure nothing is broken on mobile", "review the design", or after any change to layout, CSS, Tailwind classes, or page structure where the user cares whether it still looks right at every screen size. Also trigger proactively when the user finishes a UI-affecting feature and asks "does this look good" or "is this ready" — a responsive pass is part of answering that.
---

# UI/UX Responsive Audit

You are acting as a senior UI/UX designer *and* frontend engineer doing a
pre-ship review. The goal is not just "does it technically render" — it's
"would a real user on a real phone or a real desktop monitor hit something
broken, cramped, unreadable, or untappable." Treat this with the same rigor
as a code review: be specific, cite file/line, rank by severity, and don't
pad the report with nitpicks dressed up as blockers.

This repo is a Vite + React + Tailwind frontend (`frontend/`) with
Playwright already installed as a dependency, which is what makes automated
multi-viewport screenshotting possible without adding anything new.

## Workflow

### 1. Scope the audit
Ask (or infer from context) which routes/pages are in scope. Don't default
to auditing the entire app if the user just shipped one page or component —
audit what changed, plus any shared layout (nav, footer, modals) that change
could have affected. If genuinely unscoped ("audit the UI"), pick the
highest-traffic user-facing routes (home/landing, browse/listing, item
detail, checkout/claim flow, auth) rather than every admin/internal page.

### 2. Get a dev server running
Check if one is already up (`http://localhost:3000` is the configured Vite
port per `frontend/package.json`). If not, start it yourself:
```
cd frontend && npm run dev
```
Wait for it to be ready before capturing anything — a screenshot of a
loading spinner or a Vite error overlay is not a useful audit.

### 3. Capture the viewport matrix
Run the bundled script from `frontend/` (it needs `playwright`, which is
already a devDependency here):
```
node "../.claude/skills/ui-responsive-audit/scripts/capture_viewports.mjs" \
  --url http://localhost:3000 \
  --routes /,/browse,/item/example-id \
  --out /tmp/ui-audit
```
(Adjust the relative path to the script based on your actual working
directory, and swap `--routes` for whatever's in scope from step 1.)

This captures full-page screenshots across ~16 viewports spanning mobile
portrait, mobile landscape, tablet, and desktop — chosen to match real
device aspect ratios (e.g. 19.5:9 phones, 4:3 iPads, 16:9 and ultrawide
desktops), not arbitrary round numbers. It also runs automated checks per
viewport for the things that don't need human judgment:
- horizontal overflow
- tap targets under 44x44px
- body text under 12px
- images stretched/squashed from a missing `object-fit`
- fixed/sticky elements sitting near a viewport edge (safe-area risk)

Read `report.json` in the output directory for the structured results
before looking at images — it tells you exactly which viewport/route
combinations to look at first.

### 4. Review the screenshots yourself
The script's checks are a floor, not the audit. Open the screenshots
(Read tool supports images) for every flagged viewport, plus a spot-check
of a few unflagged ones — plenty of real breakage (overlap, bad wrapping,
awkward whitespace, "just looks cheap") produces zero automated signal.
Compare adjacent viewport widths side by side; layout breaks most often
appear in the gap *between* two breakpoints, not exactly at one.

Work through `references/checklist.md` for the full category list (layout,
touch targets, typography, media, fixed/nav elements, safe areas,
orientation, cross-breakpoint consistency, perceived accessibility) and its
severity rubric (Critical / High / Medium / Low). Don't skip straight to
writing findings — the checklist exists because some of these categories
(safe areas, orientation, hover-only interactions) are easy to forget if
you're only looking for "does anything overflow."

### 5. Trace findings back to source
For each real finding, find the component/CSS/Tailwind class responsible —
grep `frontend/src` for the relevant class names, breakpoint prefixes
(`sm:`, `md:`, `lg:`), or inline styles. A finding without a file/line
reference isn't actionable; go find it before reporting.

### 6. Report
Structure the output like a code review, most severe first:

```markdown
## UI/UX Responsive Audit — <scope>

### Critical
- **<one-line summary>** — <file:line>
  Viewport(s): <e.g. mobile-390-iphone12, mobile-844-iphone12-landscape>
  What happens: <concrete description of the break>
  Fix: <concrete suggestion, not just "make it responsive">

### High
...
### Medium
...
### Low
...

### Looks good
<Briefly note what held up well across the matrix — a real audit isn't only
complaints, and it tells the user what NOT to touch.>
```

Attach or reference the relevant screenshots for Critical/High findings so
the user doesn't have to reproduce them to believe you.

## Judgment calls

- **Fixed/sticky elements can look wrong in the full-page screenshots but be
  fine in real use.** Chromium's full-page capture freezes `position: fixed`
  elements at wherever they sat in the *first* unscrolled viewport, then
  stitches the rest of the page below/around that frozen snapshot — so a
  bottom-right floating button can appear to overlap content halfway down
  the image when a real, scrolling user would never see that overlap. Before
  reporting any finding involving a fixed/sticky element (the
  `fixedOverlapRisk` check exists to flag candidates, not confirm bugs),
  verify it with a real, non-full-page viewport screenshot (`page.screenshot()`
  without `fullPage: true`) at the same viewport size, both unscrolled and
  after scrolling to the suspect area. Only report it if it reproduces there.
- If the script can't run (no Playwright browsers installed, no dev server
  reachable), say so plainly and fall back to reading the component/CSS
  source for obvious responsive anti-patterns (fixed pixel widths, missing
  breakpoint variants, `overflow: hidden` on text containers) rather than
  silently skipping the audit or claiming full coverage you didn't have.
- Don't report the same root cause N times because it shows up on N
  viewports — collapse it into one finding and list every affected
  viewport under it.
- A finding only at 320px width (the smallest, least-used device class)
  is usually Low/Medium, not Critical, unless it blocks a core flow —
  calibrate severity to how many real users actually hit that viewport.
- If something is subjective ("this spacing feels off") rather than
  objectively broken, say so and frame it as a design opinion, not a bug —
  the user should be able to tell defects from taste.

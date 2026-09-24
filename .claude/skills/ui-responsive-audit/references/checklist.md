# Responsive UI/UX Audit Checklist

Work through these categories per screenshot/viewport. The automated script
catches the first three reliably (overflow, tap targets, tiny text, image
distortion) — everything else needs an eyeball on the screenshot, because it
requires judgment about what "looks broken" or "looks bad" means in context.

## 1. Layout & Overflow
- Any horizontal scrollbar / content wider than the viewport (script flags this — `horizontalOverflow`).
- Content clipped by `overflow: hidden` ancestors (text cut off mid-word, cards truncated unintentionally).
- Grid/flex items wrapping in a way that breaks visual grouping (e.g. a card's image wraps below its price on one breakpoint but not others).
- Elements overlapping each other — compare screenshots at adjacent widths; overlap usually appears in a narrow width band between breakpoints, not exactly at 375 or 768.
- Excess/inconsistent whitespace — huge gaps on desktop that suggest a mobile-first layout was never adapted, or content awkwardly centered in a wide container.

## 2. Touch & Input (mobile/tablet)
- Tap targets under 44x44 CSS px (script flags this — `tinyTapTargets`). Pay extra attention to icon-only buttons, close (X) buttons, and checkboxes.
- Tap targets close enough together that a finger could hit the wrong one (no visible min ~8px gap between adjacent interactive elements).
- Hover-only interactions (tooltips, dropdown menus, hover-reveal actions) that have no tap/click equivalent on touch devices.
- Form inputs that trigger the wrong mobile keyboard (e.g. a phone number field without `inputmode="numeric"` or `type="tel"`).
- Sticky/fixed action bars (checkout, "Add to cart") that cover content or get covered by the mobile browser's own UI chrome.

## 3. Typography & Readability
- Font size under 12px for body text (script flags this — `tinyText`).
- Line length that's too long on desktop (>80-90 characters) or too cramped on mobile (aggressive wrapping, orphaned single words).
- Line-height too tight when font scales up, causing descenders/ascenders to visually collide.
- Text over images/gradients without enough contrast — check both against the actual image content, not just an assumed color.
- Truncation (`text-overflow: ellipsis`) hiding information the user actually needs (prices, names) rather than decorative text.

## 4. Media & Images
- Distorted (stretched/squashed) images from missing `object-fit` (script flags this — `distortedImages`).
- Images that crop out the important subject on narrow viewports (a product photo cropping the product itself).
- Icons that don't scale crisply (blurry raster icons at high DPI — prefer SVG).
- Video/embeds that don't maintain aspect ratio or that overflow their container on rotation.

## 5. Navigation & Fixed Elements
- Fixed headers/footers overlapping content on short viewports (landscape phones are the classic failure — 667x375, 844x390).
- Bottom nav bars colliding with iOS home indicator or Android gesture bar — check `env(safe-area-inset-bottom)` is respected (script flags candidates via `fixedOverlapRisk`, but confirm visually).
- Hamburger/drawer menus that don't close on route change, or that trap focus incorrectly.
- Modal/dialog sizing on mobile — should not exceed viewport height in a way that hides the close button or primary action below the fold.

## 6. Safe Areas & Notches
- Content or interactive elements sitting under a notch/dynamic island/status bar because `viewport-fit=cover` is set without matching `env(safe-area-inset-*)` padding.
- Landscape phone view where the notch sits on the *side* — horizontal safe-area insets are the ones people forget.

## 7. Orientation Changes
- Compare the same route's portrait vs. landscape screenshot at the same device width — layout should remain usable, not just "not broken" (e.g. a full-height hero that's fine in portrait but pushes all content off-screen in landscape).
- Scroll position / open modals surviving a rotation without visually breaking.

## 8. Cross-breakpoint Consistency
- Does the design language stay consistent as width increases, or does desktop feel like an afterthought (mobile layout just stretched) or does mobile feel like a squeeze (desktop layout crammed)?
- Are breakpoints aligned with actual content needs, or arbitrary framework defaults that cause an awkward in-between state (check the 900-1100px band especially — common dead zone between "tablet" and "desktop" styles).

## 9. Perceived Accessibility (bundled here because it overlaps with visual QA)
- Color contrast for text/icons against their background (aim for WCAG AA: 4.5:1 normal text, 3:1 large text/UI components).
- Focus states visible for keyboard users at every breakpoint (don't assume desktop-only; keyboard users exist on tablets with external keyboards too).
- Content reflow at 200% browser zoom (a proxy for low-vision users) shouldn't require horizontal scrolling.

## Severity Rubric

Use this to rank findings, same spirit as a code-review severity scale:

- **Critical** — blocks a core user flow (checkout button unreachable/unclickable, content completely clipped, horizontal scroll on primary landing page, forms unusable).
- **High** — degrades a core flow but has a workaround (tap target too small but technically hittable, text readable but uncomfortably small, overlap that obscures secondary info).
- **Medium** — visible polish issue on a real device/viewport that a user would notice but that doesn't block anything (inconsistent spacing, awkward wrap, mild contrast issue).
- **Low** — cosmetic nitpick, edge-case viewport (e.g. only at 320px or only in an unusual aspect ratio), or a "nice to have" improvement.

Findings that only reproduce in the automated script's synthetic pass (e.g. one pixel of overflow from a scrollbar-width quirk) should be sanity-checked against the actual screenshot before being reported — don't report a false positive as a finding.

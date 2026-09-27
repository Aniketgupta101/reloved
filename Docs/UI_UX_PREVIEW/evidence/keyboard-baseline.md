# Keyboard baseline — 27 September 2026

Local Chrome via Playwright at a 390×844 viewport. The checked-in application ran with synthetic item GET responses. The audit blocked every non-local request and every non-GET API request, including analytics; no page errors occurred. This is browser emulation, not a screen-reader or physical-device test.

| Interaction | Observed result | Source corroboration |
| --- | --- | --- |
| Open mobile site menu | `role="dialog"` appears, but focus remains outside it on the opener, which is hidden while the menu is open. | `Navbar.tsx:17-31, 52-60, 133-146, 153-167` |
| Press Escape in site menu | Menu remains open. | `Navbar.tsx:17-31, 150-300` has no Escape handling. |
| Close site menu with its button | After the exit animation, focus is on `BODY`, not returned to the menu opener. | `Navbar.tsx:177-187` only changes `isOpen`. |
| Open Wall filter | Dialog appears, while focus remains on its button outside the dialog. | `Drop.tsx:463-477, 502-541` opens the panel without moving focus. |
| Press Escape in Wall filter | Dialog closes and focus stays on the Filter button. | `Drop.tsx:289-304` handles Escape. |
| Focus first FAQ question and press Enter | Answer becomes visible, but the question button has no `aria-expanded` value. | `StaticPages.tsx:685-707` toggles content without state attributes. |
| Focus item gallery Next photo and press Enter | The image count advances to 2/2. | `ItemDetail.tsx:185-213` provides labelled navigation buttons. |

These are baseline observations for the proposed visual migration. Preserve the working keyboard paths, then verify focus entry, containment, Escape and return for every migrated dialog or sheet. Test text zoom and assistive technology separately.

# Local design review

Open [index.html](index.html) locally. Its navigation switches between four static scenes: Wall, item detail, Give photo step, and claim detail. The controls, example item identities, and claim status are illustrative; this is **not** a working version of the application. Product images come from checked-in Reloved assets, and the header uses the supplied black master wordmark.

| Proposed design | Current app evidence |
| --- | --- |
| [Wall · 320px](wall-phone-320.png), [390px](wall-phone.png), [768px](wall-tablet.png), [1440px](wall-desktop.png) | [Wall · 320px](evidence/wall-phone-320-viewport.png), [390px](evidence/wall-phone-390-viewport.png), [768px](evidence/wall-tablet-viewport.png), [1440px](evidence/wall-desktop-viewport.png) |
| [Item · phone](item-phone.png), [desktop](item-desktop.png) | [Item · phone](evidence/item-phone-viewport.png), [desktop](evidence/item-desktop-viewport.png) |
| [Give · phone](give-phone.png) | [Give · phone](evidence/give-phone-viewport.png) |
| [Claim · phone](claim-phone.png) | No authenticated baseline captured in this audit |

The current-app screenshots used synthetic read-only API fixtures and blocked all non-local network requests. The design screenshots were rendered from this local static file with all network requests blocked. Both use browser viewport emulation, not physical-device testing. The offline static preview uses system fallback type, so font weight and spacing are approximate until checked in the React app.

See [the audit](../UI_UX_AUDIT.md) for the route/state inventory and [the design specification](../UI_UX_DESIGN.md) for the complete page-family direction and boundaries.

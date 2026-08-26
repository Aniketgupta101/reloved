from pathlib import Path

print("skip PublicLayout (already gated)")

# --- WallOfKindness ---
p = Path("frontend/src/components/sections/WallOfKindness.tsx")
t = p.read_text(encoding="utf-8")
if "BackdropSwitcher" not in t:
    t = t.replace(
        'import { BackdropLayer, useSectionBackdrop } from "@/components/ui/SectionBackdrop"',
        'import { BackdropSwitcher, useSectionBackdrop } from "@/components/ui/SectionBackdrop"',
    )
if "isClientPreviewHost" not in t:
    t = t.replace(
        'from "@/components/ui/SectionBackdrop"',
        'from "@/components/ui/SectionBackdrop"\nimport { isClientPreviewHost } from "@/lib/clientPreview"',
    )
if "Wall of Kindness backdrop" not in t:
    needle = '      <motion.div\n        key={backdrop.mode === "color" ? backdrop.colorKey : backdrop.photoKey}'
    insert = (
        "      {isClientPreviewHost() && (\n"
        '      <div className="absolute top-8 sm:top-10 right-2 sm:right-3 md:right-4 z-40 print:hidden">\n'
        '        <BackdropSwitcher label="Wall of Kindness backdrop" photos={BACKDROP_OPTIONS} state={backdrop} dark={isPhotoBackdrop} />\n'
        "      </div>\n"
        "      )}\n\n"
        + needle
    )
    if needle not in t:
        raise SystemExit("WoK motion.div not found")
    t = t.replace(needle, insert, 1)
elif "isClientPreviewHost()" not in t:
    t = t.replace(
        '      <div className="absolute top-8 sm:top-10 right-2 sm:right-3 md:right-4 z-40 print:hidden">\n'
        '        <BackdropSwitcher label="Wall of Kindness backdrop" photos={BACKDROP_OPTIONS} state={backdrop} dark={isPhotoBackdrop} />\n'
        "      </div>",
        "      {isClientPreviewHost() && (\n"
        '      <div className="absolute top-8 sm:top-10 right-2 sm:right-3 md:right-4 z-40 print:hidden">\n'
        '        <BackdropSwitcher label="Wall of Kindness backdrop" photos={BACKDROP_OPTIONS} state={backdrop} dark={isPhotoBackdrop} />\n'
        "      </div>\n"
        "      )}",
    )
t = t.replace("      {/* Dev-only backdrop switcher removed for production. */}\n", "")
p.write_text(t, encoding="utf-8")
print("WallOfKindness gated")

# --- WallOfLove ---
p = Path("frontend/src/components/sections/WallOfLoveSection.tsx")
t = p.read_text(encoding="utf-8")
if "BackdropSwitcher" not in t:
    t = t.replace(
        'import { BackdropLayer, useSectionBackdrop, type BackdropPhoto } from "@/components/ui/SectionBackdrop"',
        'import { BackdropSwitcher, BackdropLayer, useSectionBackdrop, type BackdropPhoto } from "@/components/ui/SectionBackdrop"',
    )
if "isClientPreviewHost" not in t:
    t = t.replace(
        'from "@/components/ui/SectionBackdrop"',
        'from "@/components/ui/SectionBackdrop"\nimport { isClientPreviewHost } from "@/lib/clientPreview"',
    )
simple = (
    "      {backdropPhotos && backdrop && (\n"
    '        <BackdropLayer state={backdrop} wash="bg-surface-muted/88" />\n'
    "      )}"
)
full = (
    "      {backdropPhotos && backdrop && (\n"
    "        <>\n"
    "          {isClientPreviewHost() && (\n"
    '          <div className="absolute top-4 right-2 sm:right-4 z-40 print:hidden">\n'
    '            <BackdropSwitcher label="Wall of Love backdrop" photos={backdropPhotos} state={backdrop} />\n'
    "          </div>\n"
    "          )}\n"
    '          <BackdropLayer state={backdrop} wash="bg-surface-muted/88" />\n'
    "        </>\n"
    "      )}"
)
if simple in t:
    t = t.replace(simple, full, 1)
elif "Wall of Love backdrop" in t and "isClientPreviewHost()" not in t:
    t = t.replace(
        '          <div className="absolute top-4 right-2 sm:right-4 z-40 print:hidden">\n'
        '            <BackdropSwitcher label="Wall of Love backdrop" photos={backdropPhotos} state={backdrop} />\n'
        "          </div>",
        "          {isClientPreviewHost() && (\n"
        '          <div className="absolute top-4 right-2 sm:right-4 z-40 print:hidden">\n'
        '            <BackdropSwitcher label="Wall of Love backdrop" photos={backdropPhotos} state={backdrop} />\n'
        "          </div>\n"
        "          )}",
    )
p.write_text(t, encoding="utf-8")
print("WallOfLove gated")

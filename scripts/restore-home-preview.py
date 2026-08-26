from pathlib import Path
import subprocess

head = subprocess.check_output(
    ["git", "show", "HEAD:frontend/src/pages/public/Home.tsx"], text=True, encoding="utf-8"
)
p = Path("frontend/src/pages/public/Home.tsx")
t = p.read_text(encoding="utf-8")

if "isClientPreviewHost" not in t:
    t = t.replace(
        'import { useSectionBackdrop, BackdropLayer } from "@/components/ui/SectionBackdrop"',
        'import { useSectionBackdrop, BackdropSwitcher, BackdropLayer } from "@/components/ui/SectionBackdrop"\n'
        'import { isClientPreviewHost } from "@/lib/clientPreview"',
    )
    t = t.replace(
        'import { useSectionBackdrop, BackdropSwitcher, BackdropLayer } from "@/components/ui/SectionBackdrop"',
        'import { useSectionBackdrop, BackdropSwitcher, BackdropLayer } from "@/components/ui/SectionBackdrop"\n'
        'import { isClientPreviewHost } from "@/lib/clientPreview"',
    )

# section state from HEAD
start = head.find("  // Client-facing section show/hide")
end = head.find("  return (", start)
section_state = head[start:end]

panel_start = head.find("      {/* Client-facing section visibility panel")
panel_end = head.find("      {/* =========================================================================\n          SECTION 1: HERO", panel_start)
section_panel = head[panel_start:panel_end]

bg_start = head.find("        {/* Dev-only background switcher:")
bg_end = head.find("        {heroVariant === \"reloved-digital-cards\"", bg_start)
hero_switchers = head[bg_start:bg_end]

if "SECTION_LABELS" not in t:
    t = t.replace(
        "  const heroOpacity = useTransform(heroScrollSmooth, [0, 1], [1, 0.88])\n\n\n  return (",
        "  const heroOpacity = useTransform(heroScrollSmooth, [0, 1], [1, 0.88])\n\n"
        + section_state
        + "  const showPreview = isClientPreviewHost()\n\n  return (",
    )
    if "SECTION_LABELS" not in t:
        # try single newline
        t = t.replace(
            "  const heroOpacity = useTransform(heroScrollSmooth, [0, 1], [1, 0.88])\n\n  return (",
            "  const heroOpacity = useTransform(heroScrollSmooth, [0, 1], [1, 0.88])\n\n"
            + section_state
            + "  const showPreview = isClientPreviewHost()\n\n  return (",
        )

if "Page Sections" not in t:
    gated_panel = "      {showPreview && (\n" + section_panel.rstrip() + "\n      )}\n\n"
    anchor = "    <div className=\"relative bg-background text-foreground overflow-x-hidden\">\n"
    if anchor not in t:
        raise SystemExit("home root div not found")
    t = t.replace(anchor, anchor + gated_panel, 1)

if "Hero background" not in t:
    gated_hero = "        {showPreview && (\n        <>\n" + hero_switchers + "        </>\n        )}\n\n"
    needle = '          {heroBgMode === "photo" && <div className="absolute inset-0 bg-white/12" />}\n        </div>\n\n'
    if needle not in t:
        raise SystemExit("hero bg close not found")
    t = t.replace(needle, needle + gated_hero, 1)

# Re-enable hiddenSections wrappers for hero + others when panel is used.
# On production showPreview=false and hiddenSections stays empty → all visible
# if panel hides a section on web.app, need wrappers. Restore from HEAD pattern:
if 'hiddenSections.has("hero")' not in t:
    t = t.replace(
        "      <motion.section\n        ref={heroRef}",
        '{!hiddenSections.has("hero") && (\n      <motion.section\n        ref={heroRef}',
    )
    # close hero section
    first = t.find("</motion.section>")
    t = t[: first + len("</motion.section>")] + "\n      )}" + t[first + len("</motion.section>") :]

    t = t.replace(
        "<WallOfKindnessSection flushWithHero />",
        '{!hiddenSections.has("wallOfKindness") && <WallOfKindnessSection flushWithHero />}',
        1,
    )

    # For remaining top-level sections, wrap opening after SECTION comments
    # Use unique opening lines from current file
    wraps = [
        ('      <section className="py-20 md:py-28 bg-background relative overflow-hidden border-b-2 border-foreground">', "manifesto"),
        ('      <section className="py-20 md:py-28 bg-white border-b-2 border-foreground relative overflow-hidden">', "pillars"),
        ('      <section className="py-20 md:py-28 bg-background border-b-2 border-foreground relative overflow-hidden">', "map"),
        ('      <div className="bg-white border-b-2 border-foreground">', "wallOfLove"),
        ('      <section className="py-24 bg-foreground text-background border-b-2 border-foreground relative overflow-hidden">', "partnerCta"),
        ('      <section className="py-28 relative overflow-hidden bg-background">', "finalCta"),
    ]
    for opening, key in wraps:
        if opening not in t:
            print("skip wrap missing", key)
            continue
        if f'hiddenSections.has("{key}")' in t:
            continue
        t = t.replace(opening, f'{{!hiddenSections.has("{key}") && (\n' + opening, 1)
        # close: after matching </section> or </div> that follows - find from opening
        pos = t.find(opening)
        # find next </section> or for wallOfLove </div>\n then )}
        if key == "wallOfLove":
            close = "</div>\n"
            # the wall of love wrapper is a single div - find its close after WallOfLoveSection
            cpos = t.find("</div>", pos + len(opening))
            # might be too early - look for pattern after WallOfLoveSection
            cpos = t.find("      </div>\n", pos + 50)
            if cpos != -1:
                end = cpos + len("      </div>\n")
                t = t[:end] + "      )}\n" + t[end:]
        else:
            cpos = t.find("      </section>\n", pos)
            if cpos != -1:
                end = cpos + len("      </section>\n")
                t = t[:end] + "      )}\n" + t[end:]

# Backdrop switchers before each BackdropLayer
pairs = [
    ("manifestoBackdrop", "Manifesto backdrop", "MANIFESTO_PHOTOS", ""),
    ("pillarBackdrop", "Three-Pillar backdrop", "PILLAR_PHOTOS", ""),
    ("mapBackdrop", "Impact Map backdrop", "MAP_PHOTOS", ""),
    ("partnerBackdrop", "Partner CTA backdrop", "PARTNER_PHOTOS", " dark allowOff"),
    ("ctaBackdrop", "Final CTA backdrop", "CTA_PHOTOS", ""),
]
for state, label, photos, extra in pairs:
    if label in t:
        continue
    token = f"<BackdropLayer state={{{state}}}"
    idx = t.find(token)
    if idx == -1:
        print("no layer", state)
        continue
    line_start = t.rfind("\n", 0, idx) + 1
    block = (
        "        {showPreview && (\n"
        '        <div className="absolute top-4 right-2 sm:right-4 z-40 print:hidden">\n'
        f'          <BackdropSwitcher label="{label}" photos={{{photos}}} state={{{state}}}{extra} />\n'
        "        </div>\n"
        "        )}\n"
    )
    t = t[:line_start] + block + t[line_start:]

p.write_text(t, encoding="utf-8")
print("done")
print("SECTION_LABELS", "SECTION_LABELS" in t)
print("Page Sections", "Page Sections" in t)
print("Hero background", "Hero background" in t)
print("showPreview count", t.count("showPreview"))
print("BackdropSwitcher count", t.count("BackdropSwitcher"))
print("hiddenSections.has count", t.count("hiddenSections.has"))

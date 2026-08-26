from pathlib import Path
import re

p = Path(r"frontend/src/pages/public/Home.tsx")
text = p.read_text(encoding="utf-8")

text = text.replace(
    'import { useSectionBackdrop, BackdropSwitcher, BackdropLayer } from "@/components/ui/SectionBackdrop"',
    'import { useSectionBackdrop, BackdropLayer } from "@/components/ui/SectionBackdrop"',
)

text = re.sub(
    r"\n  // Client-facing section show/hide.*?const toggleSection = \(key: SectionKey\) =>\n    setHiddenSections\(\(prev\) => \{\n      const next = new Set\(prev\)\n      next\.has\(key\) \? next\.delete\(key\) : next\.add\(key\)\n      return next\n    \}\)\n",
    "\n",
    text,
    count=1,
    flags=re.S,
)

text = re.sub(
    r"\n      \{/\* Client-facing section visibility panel — fixed, always reachable\. \*/\}.*?      </div>\n\n",
    "\n",
    text,
    count=1,
    flags=re.S,
)

text = re.sub(
    r"\n        \{/\* Dev-only background switcher:.*?        </div>\n\n",
    "\n",
    text,
    count=1,
    flags=re.S,
)

text = re.sub(
    r"\n        \{/\* Dev-only A/B/C/D switcher.*?        </div>\n\n",
    "\n",
    text,
    count=1,
    flags=re.S,
)

text = re.sub(
    r"\n        \{/\* Dev-only backdrop test switcher — always a dropdown\. \*/\}\n        <div className=\"absolute top-4 right-2 sm:right-4 z-40 print:hidden\">\n          <BackdropSwitcher[^/]*/>\n        </div>\n",
    "\n",
    text,
)

text = re.sub(
    r"\n        <div className=\"absolute top-4 right-2 sm:right-4 z-40 print:hidden\">\n          <BackdropSwitcher[^/]*/>\n        </div>\n",
    "\n",
    text,
)

text = text.replace('{!hiddenSections.has("hero") && (', "")
text = text.replace(
    '{!hiddenSections.has("wallOfKindness") && <WallOfKindnessSection flushWithHero />}',
    "<WallOfKindnessSection flushWithHero />",
)
for key in ("manifesto", "pillars", "map", "wallOfLove", "partnerCta", "finalCta"):
    text = text.replace(f'{{!hiddenSections.has("{key}") && (', "")

text = text.replace("      </motion.section>\n      )}", "      </motion.section>")
text = text.replace("      </section>\n      )}", "      </section>")
text = text.replace("      </div>\n      )}", "      </div>")

p.write_text(text, encoding="utf-8")
print("cleaned")
print("BackdropSwitcher", text.count("BackdropSwitcher"))
print("hiddenSections", text.count("hiddenSections"))
print("Page Sections", text.count("Page Sections"))
print("print:hidden", text.count("print:hidden"))

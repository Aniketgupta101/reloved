from pathlib import Path
import subprocess

raw = subprocess.check_output(["git", "show", "HEAD:frontend/src/components/layout/PublicLayout.tsx"])
text = raw.decode("utf-8")
text = text.replace(
    'import { cn } from "@/lib/utils"',
    'import { cn } from "@/lib/utils"\nimport { isClientPreviewHost } from "@/lib/clientPreview"',
)
old = (
    "      {/* Theme test switcher — fixed, on every public page. A single\n"
    "          dropdown (not a button stack) so it never crowds the page. */}\n"
    '      <div className="fixed bottom-4 right-4 z-50 print:hidden">'
)
new = (
    "      {/* Theme switcher — only on web.app / localhost client-preview hosts. */}\n"
    "      {isClientPreviewHost() && (\n"
    '      <div className="fixed bottom-4 right-4 z-50 print:hidden">'
)
if old not in text:
    raise SystemExit("theme open missing")
text = text.replace(old, new, 1)
close_old = (
    "        </select>\n"
    "      </div>\n\n"
    "      {/* Dynamic Graffiti Plaster Wall Background */}"
)
close_new = (
    "        </select>\n"
    "      </div>\n"
    "      )}\n\n"
    "      {/* Dynamic Graffiti Plaster Wall Background */}"
)
if close_old not in text:
    raise SystemExit("theme close missing")
text = text.replace(close_old, close_new, 1)
Path("frontend/src/components/layout/PublicLayout.tsx").write_text(text, encoding="utf-8", newline="\n")
print("PublicLayout OK", Path("frontend/src/components/layout/PublicLayout.tsx").stat().st_size)

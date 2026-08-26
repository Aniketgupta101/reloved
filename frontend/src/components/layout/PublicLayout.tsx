import { useState } from "react"
import { Outlet, useLocation } from "react-router-dom"
import { Navbar } from "./Navbar"
import { Footer } from "./Footer"
import { GraffitiBackground } from "@/components/assets/GraffitiBackground"
import { cn } from "@/lib/utils"
import { isClientPreviewHost, isLocalHost } from "@/lib/clientPreview"

// Theme test toggle — swaps the neo-brutalist look (thick black borders,
// hard offset shadows, all-caps black type, sharp corners, card tilts) for
// alternate looks via a scoped stylesheet keyed off the class attribute,
// rather than hand-editing every element's Tailwind classes. Sits above
// Navbar too (not just page content), since the nav carries the same look.
const THEME_OPTIONS = [
  { key: "neo", label: "Neo-Brutalist" },
  { key: "simple", label: "Simple" },
  { key: "minimal", label: "Minimal" },
  { key: "soft", label: "Soft Rounded" },
  { key: "vintage", label: "Vintage Market" },
  { key: "dark", label: "Dark Mode" },
] as const
type ThemeKey = (typeof THEME_OPTIONS)[number]["key"]

// Each theme redefines --font-display / --font-sans, the two CSS custom
// properties every heading and body element in the app already reads from
// (see index.css) — so a real typeface swap propagates everywhere for free,
// no per-component edits. Combined with distinct weight, tracking, line-
// height, and radius per theme, each one reads as a complete identity
// rather than the same page with the shadows dialed down.
const THEME_CSS: Record<Exclude<ThemeKey, "neo">, string> = {
  // Clean modern SaaS: single neutral grotesque, tight and restrained.
  simple: `
    .theme-simple { --font-display: "Inter", sans-serif; --font-sans: "Inter", sans-serif; --spacing: 0.22rem; }
    .theme-simple p, .theme-simple li { line-height: 1.55 !important; }
    .theme-simple [class*="text-foreground/80"], .theme-simple [class*="text-foreground-muted"] { color: rgba(17,17,17,0.62) !important; }
    .theme-simple [class*="shadow-["] { box-shadow: 0 2px 10px rgba(0,0,0,0.08) !important; }
    .theme-simple [class*="hover:shadow-none"]:hover { box-shadow: 0 1px 4px rgba(0,0,0,0.1) !important; }
    .theme-simple [class*="border-2"], .theme-simple [class*="border-4"] { border-width: 1px !important; }
    .theme-simple [class*="border-foreground"] { border-color: rgba(0,0,0,0.12) !important; }
    .theme-simple [class*="border-white"] { border-color: rgba(255,255,255,0.25) !important; }
    .theme-simple [class*="border-black"] { border-color: rgba(0,0,0,0.12) !important; }
    .theme-simple .font-black { font-weight: 600 !important; }
    .theme-simple .uppercase { text-transform: none !important; }
    .theme-simple [class*="tracking-"] { letter-spacing: -0.01em !important; }
    .theme-simple h1, .theme-simple h2, .theme-simple h3 { line-height: 1.15 !important; letter-spacing: -0.02em !important; }
    .theme-simple [class*="border-"], .theme-simple [class*="shadow-["] { border-radius: 10px !important; }
    .theme-simple [class*="hover:translate-x-"]:hover, .theme-simple [class*="hover:translate-y-"]:hover { transform: none !important; }
    .theme-simple [class*="-rotate-"], .theme-simple [class*=" rotate-"] { transform: none !important; }
  `,
  // Editorial minimal: serif display over a quiet sans body, near-flat chrome.
  minimal: `
    .theme-minimal { --font-display: "Fraunces", serif; --font-sans: "Inter", sans-serif; --spacing: 0.3rem; }
    .theme-minimal p, .theme-minimal li { line-height: 1.75 !important; }
    .theme-minimal [class*="text-foreground/80"], .theme-minimal [class*="text-foreground-muted"] { color: rgba(17,17,17,0.55) !important; }
    .theme-minimal [class*="shadow-["] { box-shadow: none !important; }
    .theme-minimal [class*="hover:shadow-none"]:hover { box-shadow: none !important; }
    .theme-minimal [class*="border-2"], .theme-minimal [class*="border-4"] { border-width: 0px !important; }
    .theme-minimal [class*="border-b-2"] { border-bottom-width: 1px !important; }
    .theme-minimal [class*="border-t-2"] { border-top-width: 1px !important; }
    .theme-minimal [class*="border-foreground"] { border-color: rgba(0,0,0,0.08) !important; }
    .theme-minimal [class*="border-white"] { border-color: rgba(255,255,255,0.15) !important; }
    .theme-minimal [class*="border-black"] { border-color: rgba(0,0,0,0.08) !important; }
    .theme-minimal .font-black { font-weight: 500 !important; }
    .theme-minimal .uppercase { text-transform: none !important; }
    .theme-minimal [class*="tracking-"] { letter-spacing: 0.01em !important; }
    .theme-minimal h1, .theme-minimal h2, .theme-minimal h3 { font-weight: 400 !important; line-height: 1.05 !important; letter-spacing: -0.01em !important; }
    .theme-minimal [class*="border-"], .theme-minimal [class*="shadow-["] { border-radius: 3px !important; }
    .theme-minimal [class*="hover:translate-x-"]:hover, .theme-minimal [class*="hover:translate-y-"]:hover { transform: none !important; }
    .theme-minimal [class*="-rotate-"], .theme-minimal [class*=" rotate-"] { transform: none !important; }
  `,
  // Friendly rounded SaaS: bouncy rounded display over a warm rounded body.
  soft: `
    .theme-soft { --font-display: "Baloo 2", sans-serif; --font-sans: "Nunito", sans-serif; --spacing: 0.27rem; }
    .theme-soft p, .theme-soft li { line-height: 1.65 !important; }
    .theme-soft [class*="text-foreground/80"], .theme-soft [class*="text-foreground-muted"] { color: rgba(17,17,17,0.7) !important; }
    .theme-soft [class*="shadow-["] { box-shadow: 0 8px 24px rgba(0,0,0,0.10) !important; }
    .theme-soft [class*="hover:shadow-none"]:hover { box-shadow: 0 4px 14px rgba(0,0,0,0.12) !important; }
    .theme-soft [class*="border-2"], .theme-soft [class*="border-4"] { border-width: 1px !important; }
    .theme-soft [class*="border-foreground"] { border-color: rgba(0,0,0,0.10) !important; }
    .theme-soft [class*="border-white"] { border-color: rgba(255,255,255,0.2) !important; }
    .theme-soft [class*="border-black"] { border-color: rgba(0,0,0,0.10) !important; }
    .theme-soft .font-black { font-weight: 700 !important; }
    .theme-soft .uppercase { text-transform: none !important; }
    .theme-soft [class*="tracking-"] { letter-spacing: normal !important; }
    .theme-soft h1, .theme-soft h2, .theme-soft h3 { line-height: 1.2 !important; letter-spacing: 0 !important; }
    .theme-soft [class*="border-"], .theme-soft [class*="shadow-["] { border-radius: 20px !important; }
    .theme-soft [class*="hover:translate-x-"]:hover, .theme-soft [class*="hover:translate-y-"]:hover { transform: translateY(-2px) !important; }
    .theme-soft [class*="-rotate-"], .theme-soft [class*=" rotate-"] { transform: none !important; }
  `,
  // Flea-market poster: condensed all-caps display over a warm serif body —
  // fits a preloved/secondhand brand more than any of the SaaS-leaning looks.
  vintage: `
    .theme-vintage { --font-display: "Bebas Neue", sans-serif; --font-sans: "Lora", serif; --spacing: 0.26rem; }
    .theme-vintage p, .theme-vintage li { line-height: 1.7 !important; }
    .theme-vintage [class*="text-foreground/80"], .theme-vintage [class*="text-foreground-muted"] { color: rgba(69,48,22,0.68) !important; }
    .theme-vintage [class*="shadow-["] { box-shadow: 3px 3px 0px rgba(69,48,22,0.9) !important; }
    .theme-vintage [class*="hover:shadow-none"]:hover { box-shadow: none !important; }
    .theme-vintage [class*="border-2"], .theme-vintage [class*="border-4"] { border-width: 2px !important; }
    .theme-vintage [class*="border-foreground"] { border-color: #452F16 !important; }
    .theme-vintage [class*="border-white"] { border-color: rgba(255,255,255,0.4) !important; }
    .theme-vintage [class*="border-black"] { border-color: #452F16 !important; }
    .theme-vintage .font-black { font-weight: 400 !important; }
    .theme-vintage h1, .theme-vintage h2, .theme-vintage h3 { letter-spacing: 0.02em !important; }
    .theme-vintage [class*="tracking-"] { letter-spacing: 0.08em !important; }
    .theme-vintage [class*="border-"], .theme-vintage [class*="shadow-["] { border-radius: 0px !important; }
    .theme-vintage [class*="hover:translate-x-"]:hover, .theme-vintage [class*="hover:translate-y-"]:hover { transform: none !important; }
  `,
  // Dark mode: same neo-brutalist bones, inverted surfaces, techy display face.
  dark: `
    .theme-dark {
      --font-display: "Space Grotesk", sans-serif; --font-sans: "Manrope", sans-serif;
      --background: #16130E; --foreground: #F4F0E8;
      --color-background: #16130E; --color-surface: #211C15; --color-surface-muted: #2B2419;
      --color-foreground: #F4F0E8; --color-foreground-muted: #B3A996; --color-border: #3A3226;
      background-color: var(--background); color: var(--foreground);
    }
    .theme-dark [class*="bg-white"] { background-color: #211C15 !important; }
    .theme-dark [class*="text-foreground/80"], .theme-dark [class*="text-foreground-muted"] { color: rgba(244,240,232,0.62) !important; }
    .theme-dark [class*="shadow-["] { box-shadow: 0 2px 14px rgba(0,0,0,0.5) !important; }
    .theme-dark [class*="hover:shadow-none"]:hover { box-shadow: 0 1px 6px rgba(0,0,0,0.6) !important; }
    .theme-dark [class*="border-2"], .theme-dark [class*="border-4"] { border-width: 1px !important; }
    .theme-dark [class*="border-foreground"] { border-color: rgba(244,240,232,0.18) !important; }
    .theme-dark [class*="border-black"] { border-color: rgba(244,240,232,0.18) !important; }
    .theme-dark .font-black { font-weight: 600 !important; }
    .theme-dark [class*="border-"], .theme-dark [class*="shadow-["] { border-radius: 10px !important; }
    .theme-dark [class*="hover:translate-x-"]:hover, .theme-dark [class*="hover:translate-y-"]:hover { transform: none !important; }
  `,
}

export function PublicLayout() {
  const { pathname } = useLocation()
  const isHome = pathname === "/"
  const [theme, setTheme] = useState<ThemeKey>("neo")

  return (
    <div className={cn(
      "min-h-[100dvh] flex flex-col relative bg-background text-foreground font-sans antialiased overflow-x-hidden",
      theme !== "neo" && `theme-${theme}`
    )}>
      {theme !== "neo" && <style>{THEME_CSS[theme]}</style>}

      {/* Theme switcher — only on web.app / localhost client-preview hosts. */}
      {isClientPreviewHost() && !isLocalHost() && (
      <div className="fixed bottom-4 right-4 z-50 print:hidden">
        <select
          aria-label="Site theme"
          value={theme}
          onChange={(e) => setTheme(e.target.value as ThemeKey)}
          className="text-[11px] font-black uppercase tracking-widest border-2 border-foreground shadow-[3px_3px_0px_rgba(0,0,0,1)] bg-foreground text-background px-3 py-2"
        >
          {THEME_OPTIONS.map((t) => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>
      </div>
      )}

      {/* Dynamic Graffiti Plaster Wall Background */}
      {!isHome && <GraffitiBackground />}

      {/* Content Layer */}
      <div className="relative z-10 flex flex-col min-h-[100dvh] w-full">
        <Navbar />
        {/* Home hero is a full-viewport wall photo that must start at y=0
            (behind the floating navbar). Other pages keep mt-24 so content
            clears the fixed header. */}
        <main className={cn("flex-1 w-full", !isHome && "mt-24")}>
          <Outlet />
        </main>
        <Footer />
      </div>
    </div>
  )
}

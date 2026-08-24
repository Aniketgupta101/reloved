import { useState } from "react"

// Plain-color set for every section backdrop switcher.
// Beige is the site default; white is the alternate band. No pink wash.
export const SECTION_COLORS = [
  { key: "beige", label: "Beige", className: "bg-background" },
  { key: "white", label: "White", className: "bg-white" },
  { key: "muted", label: "Muted", className: "bg-surface-muted" },
  { key: "yellow", label: "Soft Yellow", className: "bg-accent-yellow/25" },
] as const
export type SectionColorKey = (typeof SECTION_COLORS)[number]["key"]

export interface BackdropPhoto { key: string; label: string; url: string }

// One hook per section backdrop switcher — same photo-or-color pattern
// everywhere, without repeating the 3 useState calls per section.
export function useSectionBackdrop(
  photos: readonly BackdropPhoto[],
  initialMode: "photo" | "color" | "off" = "color",
  initialColor: SectionColorKey = "beige",
) {
  // Defaults to beige. Pass "white" for alternating bands.
  // A photo is an explicit opt-in. "off" is for a section whose own
  // background (e.g. a dark ground with white text) shouldn't be replaced
  // by a light color by default — the switcher can still turn one on.
  const [mode, setMode] = useState<"photo" | "color" | "off">(initialMode)
  const [photoKey, setPhotoKey] = useState<string>(photos[0].key)
  const [colorKey, setColorKey] = useState<SectionColorKey>(initialColor)
  const activePhoto = photos.find((p) => p.key === photoKey) ?? photos[0]
  const activeColor = SECTION_COLORS.find((c) => c.key === colorKey)!
  return { mode, setMode, photoKey, setPhotoKey, colorKey, setColorKey, activePhoto, activeColor }
}

// One dropdown, reused on every section: pick a photo or a plain color.
// `dark` flips the button styling for sections with a dark/foreground ground.
export function BackdropSwitcher({
  label,
  photos,
  state,
  dark = false,
  allowOff = false,
}: {
  label: string
  photos: readonly BackdropPhoto[]
  state: ReturnType<typeof useSectionBackdrop>
  dark?: boolean
  allowOff?: boolean
}) {
  const value = state.mode === "photo" ? `photo:${state.photoKey}` : state.mode === "color" ? `color:${state.colorKey}` : "off"
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => {
        if (e.target.value === "off") {
          state.setMode("off")
          return
        }
        const [mode, key] = e.target.value.split(":")
        if (mode === "photo") {
          state.setMode("photo")
          state.setPhotoKey(key)
        } else {
          state.setMode("color")
          state.setColorKey(key as SectionColorKey)
        }
      }}
      className={`text-[10px] font-black uppercase tracking-widest border-2 px-2 py-1.5 max-w-[42vw] sm:max-w-none ${
        dark
          ? "border-white bg-foreground text-white"
          : "border-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)] bg-white text-foreground"
      }`}
    >
      {allowOff && <option value="off">Off (original)</option>}
      <optgroup label="Photos">
        {photos.map((p) => (
          <option key={p.key} value={`photo:${p.key}`}>{p.label}</option>
        ))}
      </optgroup>
      <optgroup label="Colors">
        {SECTION_COLORS.map((c) => (
          <option key={c.key} value={`color:${c.key}`}>{c.label}</option>
        ))}
      </optgroup>
    </select>
  )
}

// The backdrop layer itself: photo + soft wash, a flat color, or nothing
// (section's own original background shows through) — reused identically
// everywhere a section has a switcher.
export function BackdropLayer({ state, wash = "bg-white/70" }: { state: ReturnType<typeof useSectionBackdrop>; wash?: string }) {
  if (state.mode === "off") return null
  if (state.mode === "color") {
    return <div className={`absolute inset-0 z-0 ${state.activeColor.className}`} />
  }
  return (
    <div className="absolute inset-0 z-0">
      <img src={state.activePhoto.url} alt="" className="w-full h-full object-cover" />
      <div className={`absolute inset-0 ${wash}`} />
    </div>
  )
}

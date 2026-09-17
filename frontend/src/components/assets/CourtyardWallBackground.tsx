import { COURTYARD_CONTINUE_BG, SECTION_PAPER_BG } from "@/lib/assets"

/** Center column that sits between the courtyard lights / planters. */
export const courtyardAisleClass =
  "mx-auto w-full max-w-[56rem] lg:max-w-[62rem] xl:max-w-[68rem] px-4 sm:px-6"

/** Fixed site backdrop. Home/Wall use courtyard; other pages (incl. account) use cream paper. */
export function CourtyardWallBackground({
  variant = "courtyard",
}: {
  variant?: "courtyard" | "paper"
}) {
  const src = variant === "paper" ? SECTION_PAPER_BG : COURTYARD_CONTINUE_BG
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none" aria-hidden="true">
      <img
        src={src}
        alt=""
        decoding="async"
        fetchPriority="high"
        onError={(e) => {
          const target = e.currentTarget
          if (target.src.includes(".webp")) {
            target.src = target.src.replace(/\.webp(\?.*)?$/, ".png$1")
          } else if (!target.src.includes("reloved-digital.web.app")) {
            target.src = "https://reloved-digital.web.app/images/hero-bg-desktop-lamps-wide.png"
          } else {
            target.style.display = "none"
          }
        }}
        className="absolute inset-0 h-full w-full max-w-none object-cover"
      />
      {variant === "courtyard" && <div className="absolute inset-0 bg-white/5" />}
    </div>
  )
}

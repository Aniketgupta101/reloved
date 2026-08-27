import { COURTYARD_CONTINUE_BG, SECTION_PAPER_BG } from "@/lib/assets"

/** Vintage barn sconce — sits near the planters, not over the item grid. */
function BarnLight({ side }: { side: "left" | "right" }) {
  return (
    <div
      className={`absolute top-[18%] sm:top-[16%] md:top-[20%] w-[9vw] max-w-[88px] min-w-[44px] ${
        side === "left" ? "left-[1.5%] sm:left-[2%]" : "right-[1.5%] sm:right-[2%]"
      }`}
    >
      <svg viewBox="0 0 80 110" fill="none" aria-hidden="true" className="w-full h-auto drop-shadow-[0_8px_18px_rgba(0,0,0,0.28)]">
        <path d="M28 8h24v10H28z" fill="#1a1a1a" />
        <path d="M18 18h44l-8 16H26L18 18z" fill="#111" />
        <path d="M26 34h28v6H26z" fill="#1a1a1a" />
        <ellipse cx="40" cy="48" rx="10" ry="12" fill="#FFDE59" opacity="0.95" />
        <ellipse cx="40" cy="48" rx="18" ry="22" fill="#FFDE59" opacity="0.22" />
        <ellipse cx="40" cy="72" rx="28" ry="20" fill="#FFDE59" opacity="0.12" />
      </svg>
    </div>
  )
}

/** Center column that sits between the courtyard lights / planters. */
export const courtyardAisleClass =
  "mx-auto w-full max-w-[52rem] lg:max-w-[56rem] xl:max-w-[60rem] px-4 sm:px-6"

/** Fixed site backdrop. Home uses the courtyard wall; other public pages use cream paper. */
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
        className={
          variant === "courtyard"
            ? "absolute left-1/2 top-[46%] h-[128%] w-[172%] max-w-none -translate-x-1/2 -translate-y-1/2 object-cover object-bottom"
            : "absolute inset-0 h-full w-full max-w-none object-cover"
        }
      />
      {variant === "courtyard" && (
        <>
          <div className="absolute inset-0 bg-white/10" />
          <BarnLight side="left" />
          <BarnLight side="right" />
        </>
      )}
    </div>
  )
}

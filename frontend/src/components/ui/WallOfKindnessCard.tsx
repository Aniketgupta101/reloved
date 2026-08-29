import { Link } from "react-router-dom"
import { Tape, FreeStamp } from "@/components/assets/RelovedAssets"
import { SafeImage } from "@/components/ui/SafeImage"
import { AnalyticsEvent, track } from "@/lib/analytics"

export interface WallOfKindnessCardItem {
  slug: string
  title: string
  category?: string | null
  condition?: string | null
  locality?: string | null
  size?: string | null
  image?: string | null
  publicStatus?: string | null
  /** Soft personal match from donor clothing preference - distinct from publicStatus being_matched. */
  recommended?: boolean
}

interface WallOfKindnessCardProps {
  item: WallOfKindnessCardItem
  /** Rotated washi-tape corner detail - the grid uses it, denser layouts (hero) skip it. */
  showTape?: boolean
  tapeStyle?: string
  /** Larger featured “for you” tile above the rest of the wall. */
  featured?: boolean
  /** Eager-load image (hero above-the-fold tiles). */
  priority?: boolean
}

/** Same Free stamp shell + hover; ink only differs (no yellow). */
function statusStampProps(status: string): { label: string; shortLabel?: string; tone: string } {
  if (status === "being_matched") {
    return {
      label: "Being matched",
      shortLabel: "Matched",
      tone: "border-accent-blue text-accent-blue",
    }
  }
  if (status === "claimed") {
    return { label: "Claimed", tone: "border-accent-green text-foreground" }
  }
  if (status === "reloved") {
    return { label: "Reloved", tone: "border-accent-pink text-accent-pink" }
  }
  return { label: "FREE", tone: "border-accent-red text-accent-red" }
}

// The single card design used everywhere an item is shown as a tile -
// Wall of Kindness grid, hero grid, anywhere else that needs "this exact
// card." Change it once here, every surface stays in sync.
export function WallOfKindnessCard({
  item,
  showTape = true,
  tapeStyle = "-top-3 left-1/2 -translate-x-1/2 -rotate-2",
  featured = false,
  priority = false,
}: WallOfKindnessCardProps) {
  const status = (item.publicStatus || "available").toLowerCase()
  const isAvailable = status === "available"

  return (
    <Link
      to={`/drop/${item.slug}`}
      className={`group block relative focus:outline-none ${featured ? "w-full" : ""}`}
      title={`View ${item.title}`}
      onClick={() =>
        track(AnalyticsEvent.itemCardClicked, {
          slug: item.slug,
          category: item.category || undefined,
          status: status,
        })
      }
    >
      <div
        className={`p-2 md:p-2.5 bg-white border-2 border-foreground shadow-[5px_5px_0px_rgba(0,0,0,1)] group-hover:shadow-[10px_10px_0px_rgba(0,0,0,1)] group-hover:scale-[1.03] transition-all duration-300 relative flex flex-col h-full ${
          featured ? "md:p-3 shadow-[8px_8px_0px_rgba(0,0,0,1)]" : ""
        }`}
      >
        {showTape && (
          <Tape className={`${tapeStyle} scale-110 z-20 group-hover:scale-125 transition-transform duration-300`} />
        )}

        {/* Poster Image Container */}
        <div className="relative aspect-square border-2 border-foreground/15 overflow-hidden bg-white mb-2">
          <SafeImage
            src={item.image ?? undefined}
            alt={item.title}
            priority={featured || priority}
            className="w-full h-full object-contain bg-white opacity-100 transition-transform duration-500 group-hover:scale-105"
          />

          {/* Status stamp only - no white wash (it made garments look faded). */}
          <div className="absolute bottom-1 right-1 sm:bottom-2 sm:right-2 z-10 max-w-[85%] transition-transform duration-300 group-hover:rotate-6 sm:group-hover:rotate-12 group-hover:scale-105 sm:group-hover:scale-110">
            <FreeStamp {...statusStampProps(status)} />
          </div>

          {item.recommended && isAvailable && (
            <div className="absolute top-1 right-1 sm:top-2 sm:right-2 z-10 max-w-[45%]">
              <span className="inline-block font-black text-[7px] sm:text-[9px] md:text-[10px] uppercase tracking-wide sm:tracking-widest border border-accent-blue sm:border-2 text-accent-blue px-1 sm:px-2 py-0.5 bg-white/50 backdrop-blur-sm rotate-[4deg] shadow-sm whitespace-nowrap">
                FOR YOU
              </span>
            </div>
          )}
        </div>

        {/* Poster Caption / Footer */}
        <div className="flex flex-col flex-1 justify-between gap-1.5">
          <div>
            <h3
              className={`font-display font-black leading-snug uppercase text-foreground line-clamp-2 ${
                featured ? "text-sm sm:text-base" : "text-[11px] sm:text-sm"
              }`}
            >
              {item.title}
            </h3>
          </div>

          <div className="pt-1.5 border-t border-foreground/15 flex items-center justify-between gap-1 text-[9px] sm:text-[10px] font-bold text-foreground-muted">
            <div className="flex flex-col min-w-0">
              <span className="uppercase text-foreground truncate">{item.locality || "Mumbai"}</span>
              {item.condition && <span className="text-[8px] sm:text-[9px] opacity-75">{item.condition}</span>}
            </div>

            {item.size ? (
              <span className="shrink-0 font-black uppercase bg-surface-muted px-1.5 sm:px-2 py-0.5 border border-foreground/30 text-foreground text-[8px] sm:text-[10px] max-w-[55%] truncate">
                {item.size}
              </span>
            ) : (
              <span className="shrink-0 font-black text-[8px] sm:text-[9px] uppercase text-accent-green bg-accent-green/10 px-1 sm:px-1.5 py-0.5 border border-accent-green/30">
                ₹0 FREE
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}

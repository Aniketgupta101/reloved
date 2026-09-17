import { Link } from "react-router-dom"
import { Tape } from "@/components/assets/RelovedAssets"
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

/** Top-left life-cycle tags on the Wall — Claimed / Reloved (matches item detail). */
function topLeftTag(
  status: string,
): { label: string; shortLabel?: string; className: string } | null {
  if (status === "being_matched" || status === "claimed") {
    return {
      label: "Claimed",
      shortLabel: "Claimed",
      // Solid pink + white text so it stays readable on light product photos
      className: "border-foreground bg-accent-pink text-white",
    }
  }
  if (status === "reloved") {
    return {
      label: "Reloved",
      className: "border-foreground bg-white text-accent-pink",
    }
  }
  return null
}

function normalizeWallStatus(raw: string | null | undefined): string {
  const s = String(raw || "available").trim().toLowerCase().replace(/\s+/g, "_")
  if (s === "being_matched" || s === "claimed" || s === "reloved" || s === "available") return s
  return "available"
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
  const status = normalizeWallStatus(item.publicStatus)
  const cornerTag = topLeftTag(status)
  const showAvailable = status === "available"

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
            className="w-full h-full object-contain bg-white transition-transform duration-500 group-hover:scale-105"
          />

          {/* Top-left: Claimed / Reloved */}
          {cornerTag && (
            <div className="absolute top-1 left-1 sm:top-2 sm:left-2 z-20 max-w-[70%] rotate-[4deg]">
              <span
                className={`inline-block font-display font-black uppercase tracking-wide sm:tracking-widest border-2 px-1.5 sm:px-2 py-0.5 text-[8px] sm:text-[9px] md:text-[10px] leading-none shadow-[2px_2px_0px_rgba(0,0,0,1)] whitespace-nowrap ${cornerTag.className}`}
              >
                <span className="sm:hidden">{cornerTag.shortLabel || cornerTag.label}</span>
                <span className="hidden sm:inline">{cornerTag.label}</span>
              </span>
            </div>
          )}

          {/* Bottom-right: Available — solid stamp so it stays visible on white cutouts */}
          {showAvailable ? (
            <div className="absolute bottom-1 right-1 sm:bottom-2 sm:right-2 z-20 max-w-[60%] -rotate-[6deg]">
              <span className="inline-block font-display font-black uppercase tracking-wide sm:tracking-widest border-2 border-foreground bg-white text-accent-red px-1.5 sm:px-2 py-0.5 text-[8px] sm:text-[9px] md:text-[10px] leading-none shadow-[2px_2px_0px_rgba(0,0,0,1)] whitespace-nowrap">
                <span className="sm:hidden">Free</span>
                <span className="hidden sm:inline">Available</span>
              </span>
            </div>
          ) : null}
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

            <div className="flex items-center gap-1 shrink-0 max-w-[60%]">
              {item.size ? (
                <span className="font-black uppercase bg-surface-muted px-1.5 sm:px-2 py-0.5 border border-foreground/30 text-foreground text-[8px] sm:text-[10px] truncate">
                  {item.size}
                </span>
              ) : null}
              <span className="font-black text-[8px] sm:text-[9px] uppercase text-accent-green bg-accent-green/10 px-1 sm:px-1.5 py-0.5 border border-accent-green/30 whitespace-nowrap">
                ₹0 FREE
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}

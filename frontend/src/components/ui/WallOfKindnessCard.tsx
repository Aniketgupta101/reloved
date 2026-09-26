import { Link } from "react-router-dom"
import { Tape } from "@/components/assets/RelovedAssets"
import { ProductFillImage } from "@/components/ui/ProductFillImage"
import { AnalyticsEvent, track } from "@/lib/analytics"
import { formatWallLocality } from "@/lib/formatLocality"
import {
  normalizeWallPublicStatus,
  wallStatusTagClassName,
  wallStatusTagLabel,
  wallStatusTagShortLabel,
} from "@/lib/wallStatusLabels"

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
  /** Owner-only: studio cutout still running — grayed card, not claimable. */
  imageProcessing?: boolean
  /** Override link target (e.g. account drops while processing). */
  href?: string
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

/** Top-left life-cycle tags: Being Matched / Claimed / Reloved. */
function topLeftTag(
  status: string,
): { label: string; shortLabel?: string; className: string } | null {
  if (status === "being_matched" || status === "claimed" || status === "reloved") {
    return {
      label: wallStatusTagLabel(status),
      shortLabel: wallStatusTagShortLabel(status),
      className: wallStatusTagClassName(status),
    }
  }
  return null
}

// The single card design used everywhere an item is shown as a tile -
// Wall of Kindness grid, hero grid, anywhere else that needs "this exact
// card." Change it once here, every surface stays in sync.
export function WallOfKindnessCard({
  item,
  showTape = false,
  tapeStyle = "-top-3 left-1/2 -translate-x-1/2",
  featured = false,
  priority = false,
}: WallOfKindnessCardProps) {
  const status = normalizeWallPublicStatus(item.publicStatus)
  const cornerTag = topLeftTag(status)
  const showAvailable = status === "available"
  const processing = Boolean(item.imageProcessing)
  const to = item.href || `/drop/${item.slug}`

  return (
    <Link
      to={to}
      className={`group block relative h-full focus:outline-none ${
        featured ? "w-full pr-2 pb-2 md:pr-2 md:pb-2" : "pr-[5px] pb-[5px]"
      } ${processing ? "pointer-events-auto" : ""}`}
      title={processing ? `${item.title} — processing image` : `View ${item.title}`}
      onClick={() =>
        track(AnalyticsEvent.itemCardClicked, {
          slug: item.slug,
          category: item.category || undefined,
          status: status,
        })
      }
    >
      <div
        className={`bg-white border-2 border-foreground shadow-[5px_5px_0px_rgba(0,0,0,1)] group-hover:shadow-none group-hover:translate-x-[5px] group-hover:translate-y-[5px] transition-all duration-200 relative flex flex-col h-full ${
          featured ? "p-1 sm:p-1.5" : "p-0.5 sm:p-1"
        }`}
      >
        {showTape && (
          <Tape className={`${tapeStyle} scale-110 z-20`} />
        )}

        {/* Fixed square — ProductFillImage trims padding so tees match flannels. */}
        <div className="relative aspect-square w-full border-2 border-foreground/15 overflow-hidden bg-white mb-1 shrink-0">
          <ProductFillImage
            src={item.image}
            alt={item.title}
            priority={featured || priority}
            muted={processing}
            className="absolute inset-0"
          />
          {processing && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/25">
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest bg-white border-2 border-foreground px-2 py-1">
                Processing image…
              </span>
            </div>
          )}

          {/* Top-left: Being Matched / Claimed / Reloved */}
          {cornerTag && !processing && (
            <div className="absolute top-1 left-1 sm:top-2 sm:left-2 z-20 max-w-[70%]">
              <span
                className={`inline-block font-display font-black uppercase tracking-wide sm:tracking-widest border-2 px-1.5 sm:px-2 py-0.5 text-[8px] sm:text-[9px] md:text-[10px] leading-none shadow-[2px_2px_0px_rgba(0,0,0,1)] whitespace-nowrap ${cornerTag.className}`}
              >
                <span className="sm:hidden">{cornerTag.shortLabel || cornerTag.label}</span>
                <span className="hidden sm:inline">{cornerTag.label}</span>
              </span>
            </div>
          )}

          {/* Bottom-right: Available stamp */}
          {showAvailable ? (
            <div className="absolute bottom-1 right-1 sm:bottom-2 sm:right-2 z-20 max-w-[60%]">
              <span className="inline-block font-display font-black uppercase tracking-widest border-2 border-foreground bg-white text-accent-red px-1.5 sm:px-2 py-0.5 text-[8px] sm:text-[9px] md:text-[10px] leading-none shadow-[2px_2px_0px_rgba(0,0,0,1)] whitespace-nowrap">
                <span className="sm:hidden">Free</span>
                <span className="hidden sm:inline">Available</span>
              </span>
            </div>
          ) : null}
        </div>

        {/* Caption — compact so the photo owns the tile */}
        <div className="flex flex-col flex-1 justify-between gap-0.5 min-h-0 px-0.5 pb-0.5">
          <div className="min-h-[2em]">
            <h3
              className={`font-display font-black leading-snug uppercase text-foreground line-clamp-2 ${
                featured ? "text-sm sm:text-base" : "text-[11px] sm:text-sm"
              }`}
            >
              {item.title}
            </h3>
          </div>

          <div className="pt-1 border-t border-foreground/15 flex items-center justify-between gap-1 text-[9px] sm:text-[10px] font-bold text-foreground-muted min-h-[1.8em]">
            <div className="flex flex-col min-w-0">
              <span className="uppercase text-foreground truncate">{formatWallLocality(item.locality)}</span>
              <span className="text-[8px] sm:text-[9px] opacity-75 truncate">{item.condition || "\u00a0"}</span>
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

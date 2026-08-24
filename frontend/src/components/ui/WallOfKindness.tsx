import { Link } from "react-router-dom"
import { Tape, FreeStamp } from "@/components/assets/RelovedAssets"
import { SafeImage } from "@/components/ui/SafeImage"

export interface WallItem {
  id: string
  slug: string
  title: string
  category: string
  condition: string
  locality: string
  size?: string | null
  gender?: string | null
  public_status: string
  item_images: { storage_path: string }[]
}

interface WallOfKindnessProps {
  items: WallItem[]
}

const TAPE_STYLES = [
  "-top-3 left-1/2 -translate-x-1/2 -rotate-2",
  "-top-3 left-6 -rotate-12",
  "-top-3 right-6 rotate-12",
  "-top-3 left-1/2 -translate-x-1/2 rotate-3"
]

export function WallOfKindness({ items }: WallOfKindnessProps) {
  if (!items || items.length === 0) {
    return null
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-8 lg:gap-10 pt-4 pb-6">
      {items.map((item, i) => {
        const tapeStyle = TAPE_STYLES[i % TAPE_STYLES.length]
        const imagePath = item.item_images?.[0]?.storage_path

        const isAvailable = !item.public_status || item.public_status === "available"
        const isMatched = item.public_status === "being_matched"
        const isReloved = item.public_status === "reloved"

        return (
          <Link
            key={item.id || i}
            to={`/drop/${item.slug}`}
            className="group block relative focus:outline-none"
            title={`View ${item.title}`}
          >
            <div
              className="p-3 md:p-4 bg-white border-2 border-foreground shadow-[5px_5px_0px_rgba(0,0,0,1)] group-hover:shadow-[10px_10px_0px_rgba(0,0,0,1)] group-hover:scale-[1.03] transition-all duration-300 relative flex flex-col h-full"
            >
              {/* Tape Detail */}
              <Tape className={`${tapeStyle} scale-110 z-20 group-hover:scale-125 transition-transform duration-300`} />

              {/* Poster Image Container */}
              <div className="relative aspect-square border-2 border-foreground/15 overflow-hidden bg-white mb-3">
                <SafeImage
                  src={imagePath}
                  alt={item.title}
                  className="w-full h-full object-contain p-2 transition-transform duration-500 group-hover:scale-105"
                />

                {/* Status Badges */}
                {isAvailable && (
                  <div className="absolute bottom-2 right-2 z-10 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110">
                    <FreeStamp />
                  </div>
                )}

                {isMatched && (
                  <div className="absolute inset-0 bg-white/70 backdrop-blur-[2px] flex items-center justify-center p-2 z-10">
                    <span className="font-black text-[10px] md:text-xs uppercase tracking-widest border-2 border-foreground px-2.5 py-1 bg-accent-yellow text-foreground rotate-[-6deg] shadow-[3px_3px_0px_rgba(0,0,0,1)]">
                      BEING MATCHED
                    </span>
                  </div>
                )}

                {isReloved && (
                  <div className="absolute inset-0 bg-white/75 backdrop-blur-[2px] flex items-center justify-center p-2 z-10">
                    <span className="font-black text-[10px] md:text-xs uppercase tracking-widest border-2 border-foreground px-2.5 py-1 bg-accent-pink text-foreground rotate-[5deg] shadow-[3px_3px_0px_rgba(0,0,0,1)]">
                      GIVEN &bull; RELOVED
                    </span>
                  </div>
                )}

                {/* Top Category Badge */}
                <div className="absolute top-2 left-2 z-10 bg-white/90 backdrop-blur-sm border border-foreground px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-foreground shadow-[1px_1px_0px_rgba(0,0,0,1)]">
                  {item.category}
                </div>
              </div>

              {/* Poster Caption / Footer */}
              <div className="flex flex-col flex-1 justify-between gap-2">
                <div>
                  <h3 className="font-display font-black text-sm md:text-base leading-snug uppercase text-foreground line-clamp-2">
                    {item.title}
                  </h3>
                </div>

                <div className="pt-2 border-t border-foreground/15 flex items-center justify-between text-[10px] font-bold text-foreground-muted">
                  <div className="flex flex-col">
                    <span className="uppercase text-foreground">{item.locality}</span>
                    <span className="text-[9px] opacity-75">{item.condition}</span>
                  </div>

                  {item.size ? (
                    <span className="font-black uppercase bg-surface-muted px-2 py-0.5 border border-foreground/30 text-foreground">
                      {item.size}
                    </span>
                  ) : (
                    <span className="font-black text-[9px] uppercase text-accent-green bg-accent-green/10 px-1.5 py-0.5 border border-accent-green/30">
                      ₹0 FREE
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}

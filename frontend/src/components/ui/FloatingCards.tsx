import { Link } from "react-router-dom"
import { motion } from "motion/react"
import { Tape, FreeStamp } from "@/components/assets/RelovedAssets"
import { SafeImage } from "@/components/ui/SafeImage"

const HERO_CARD_ITEMS = [
  {
    id: "hero-1",
    slug: "vintage-leather-jacket",
    title: "Leather Jacket",
    image: "https://images.unsplash.com/photo-1551537482-f2075a1d41f2?w=800&q=80",
    statusColor: "bg-accent-green text-foreground",
    typeTag: "PRE-LOVED",
    badgeText: "AVAILABLE",
    position: "top-[8%] left-[0.5%] lg:left-[2%] xl:left-[3%] 2xl:left-[6%] w-40 lg:w-44 xl:w-48",
    initialRotate: -6,
    floatOffset: [0, -10, 0],
    duration: 4.2,
    stamp: "free"
  },
  {
    id: "hero-2",
    slug: "retro-film-camera",
    title: "Analog Camera",
    image: "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=800&q=80",
    statusColor: "bg-accent-yellow text-foreground",
    typeTag: "KINDNESS MATCH",
    badgeText: "MATCHED",
    position: "bottom-[10%] left-[0.5%] lg:left-[2%] xl:left-[4%] 2xl:left-[7%] w-40 lg:w-44 xl:w-48",
    initialRotate: 5,
    floatOffset: [0, 10, 0],
    duration: 4.8,
    stamp: "none"
  },
  {
    id: "hero-3",
    slug: "canvas-sneakers",
    title: "Canvas Sneakers",
    image: "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=800&q=80",
    statusColor: "bg-accent-pink text-foreground",
    typeTag: "RELOVED",
    badgeText: "PRE-LOVED",
    position: "top-[10%] right-[0.5%] lg:right-[2%] xl:right-[3%] 2xl:right-[6%] w-40 lg:w-44 xl:w-48",
    initialRotate: 7,
    floatOffset: [0, 8, 0],
    duration: 4.5,
    stamp: "free"
  },
  {
    id: "hero-4",
    slug: "wooden-ukulele",
    title: "Wooden Ukulele",
    image: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&q=80",
    statusColor: "bg-accent-blue text-white",
    typeTag: "VERIFIED DROP",
    badgeText: "₹0 FREE",
    position: "bottom-[12%] right-[0.5%] lg:right-[2%] xl:right-[4%] 2xl:right-[7%] w-40 lg:w-44 xl:w-48",
    initialRotate: -5,
    floatOffset: [0, -8, 0],
    duration: 5.2,
    stamp: "free"
  }
]

export function FloatingCards() {
  return (
    <div className="absolute inset-0 pointer-events-none z-10 hidden lg:block overflow-hidden">
      {HERO_CARD_ITEMS.map((c, index) => {
        return (
          <motion.div
            key={c.id || index}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{
              opacity: 1,
              scale: 1,
              y: c.floatOffset
            }}
            transition={{
              opacity: { duration: 0.6, delay: index * 0.12 },
              scale: { duration: 0.6, delay: index * 0.12 },
              y: { duration: c.duration, repeat: Infinity, ease: "easeInOut" }
            }}
            className={`absolute ${c.position}`}
          >
            <Link
              to={`/drop/${c.slug}`}
              className="block pointer-events-auto group focus:outline-none"
              title={`View ${c.title}`}
            >
              <div className="p-2.5 bg-white border-2 border-foreground shadow-[5px_5px_0px_rgba(0,0,0,1)] relative group-hover:rotate-0 group-hover:scale-105 group-hover:shadow-[8px_8px_0px_rgba(0,0,0,1)] transition-all duration-300">
                <Tape className="-top-3 left-1/2 -translate-x-1/2 scale-90" />

                {/* Square image + status tag / FREE stamp */}
                <div className="relative aspect-square border border-foreground/10 overflow-hidden bg-white mb-2">
                  <SafeImage
                    src={c.image}
                    alt={c.title}
                    className="w-full h-full object-contain bg-white transition-transform duration-500 group-hover:scale-105"
                  />
                  {c.badgeText === "MATCHED" && (
                    <div className="absolute top-1 left-1 z-10">
                      <span className="inline-block border-2 border-foreground px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider bg-accent-yellow text-foreground shadow-[1px_1px_0px_rgba(0,0,0,1)]">
                        Being matched
                      </span>
                    </div>
                  )}
                  {c.typeTag === "RELOVED" && (
                    <div className="absolute top-1 left-1 z-10">
                      <span className="inline-block border-2 border-foreground px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider bg-accent-pink text-foreground shadow-[1px_1px_0px_rgba(0,0,0,1)]">
                        Reloved
                      </span>
                    </div>
                  )}
                  {c.stamp === "free" && (
                    <FreeStamp className="absolute bottom-1 right-1 z-20 scale-[0.4] origin-bottom-right transition-transform duration-300 group-hover:scale-[0.45]" />
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <span className="truncate text-foreground font-black text-[10px] uppercase tracking-wide">{c.title}</span>
                  <div className="pt-1 border-t border-foreground/15 flex items-center justify-between text-[9px] font-bold text-foreground-muted">
                    <span className="uppercase">{c.badgeText === "MATCHED" ? "Being matched" : "Mumbai"}</span>
                    <span className="font-black uppercase bg-surface-muted px-1.5 py-0.5 border border-foreground/30 text-foreground text-[8px]">
                      {c.stamp === "free" ? "₹0 FREE" : c.badgeText}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          </motion.div>
        )
      })}
    </div>
  )
}

import type { ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"
import { WallOfKindnessCard } from "@/components/ui/WallOfKindnessCard"
import { isGenderMatch } from "@/lib/genderMatch"

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
  imageProcessingStatus?: string | null
  publicVisibility?: boolean
  item_images: { storage_path: string }[]
}

interface WallOfKindnessProps {
  items: WallItem[]
  /** Donor clothing preference - top matches under “Picked for you”, rest below. */
  preferGender?: string | null
  /** How many matches to feature in Picked for you (default 4). */
  pickedLimit?: number
}

const TAPE_STYLES = [
  "-top-3 left-1/2 -translate-x-1/2",
  "-top-3 left-6",
  "-top-3 right-6",
  "-top-3 left-1/2 -translate-x-1/2",
]

const EASE = [0.32, 0.72, 0, 1] as const

function toCardProps(item: WallItem, preferGender?: string | null) {
  const processing = item.imageProcessingStatus === "processing" || item.publicVisibility === false
  return {
    slug: item.slug,
    title: item.title,
    category: item.category,
    condition: item.condition,
    locality: item.locality,
    size: item.size,
    image: item.item_images?.[0]?.storage_path,
    secondaryImage: item.item_images?.[1]?.storage_path || null,
    publicStatus: item.public_status,
    recommended: isGenderMatch(item.gender, preferGender),
    imageProcessing: processing,
    href: processing ? "/account?tab=drops" : undefined,
  }
}

function hasImage(item: WallItem) {
  return (item.item_images || []).some((img) => Boolean(img.storage_path))
}

function WallCardMotion({
  children,
  index,
  reduceMotion,
}: {
  children: ReactNode
  index: number
  reduceMotion: boolean | null
}) {
  if (reduceMotion) return <>{children}</>
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.42,
        ease: EASE,
        delay: Math.min(index * 0.045, 0.55),
      }}
      className="h-full"
    >
      {children}
    </motion.div>
  )
}

export function WallOfKindness({ items, preferGender, pickedLimit = 4 }: WallOfKindnessProps) {
  const reduceMotion = useReducedMotion()
  const withPhotos = (items || []).filter(hasImage)
  if (withPhotos.length === 0) {
    return null
  }

  const matches = preferGender
    ? withPhotos.filter(
        (item) =>
          item.public_status === "available" && isGenderMatch(item.gender, preferGender),
      )
    : []
  const picked = matches.slice(0, pickedLimit)
  const pickedIds = new Set(picked.map((item) => item.id))
  const rest = withPhotos.filter((item) => !pickedIds.has(item.id))

  return (
    <div className="flex flex-col gap-8 md:gap-10 pt-4 pb-6">
      {picked.length > 0 && (
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] mb-4 text-foreground">
            Picked for you
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5 md:gap-6">
            {picked.map((item, i) => (
              <WallCardMotion key={item.id || `picked-${i}`} index={i} reduceMotion={reduceMotion}>
                <WallOfKindnessCard
                  tapeStyle={TAPE_STYLES[i % TAPE_STYLES.length]}
                  priority
                  item={toCardProps(item, preferGender)}
                />
              </WallCardMotion>
            ))}
          </div>
        </div>
      )}

      {rest.length > 0 && (
        <div>
          {picked.length > 0 && (
            <p className="text-[11px] font-black uppercase tracking-[0.2em] mb-4 text-foreground-muted">
              More on the wall
            </p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5 md:gap-6">
            {rest.map((item, i) => (
              <WallCardMotion
                key={item.id || i}
                index={picked.length + i}
                reduceMotion={reduceMotion}
              >
                <WallOfKindnessCard
                  tapeStyle={TAPE_STYLES[i % TAPE_STYLES.length]}
                  immediate={i < 12}
                  item={toCardProps(item, preferGender)}
                />
              </WallCardMotion>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

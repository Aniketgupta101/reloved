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
  item_images: { storage_path: string }[]
}

interface WallOfKindnessProps {
  items: WallItem[]
  /** Donor clothing preference — featured match on top, rest below. */
  preferGender?: string | null
}

const TAPE_STYLES = [
  "-top-3 left-1/2 -translate-x-1/2 -rotate-2",
  "-top-3 left-6 -rotate-12",
  "-top-3 right-6 rotate-12",
  "-top-3 left-1/2 -translate-x-1/2 rotate-3",
]

function toCardProps(item: WallItem, preferGender?: string | null) {
  return {
    slug: item.slug,
    title: item.title,
    category: item.category,
    condition: item.condition,
    locality: item.locality,
    size: item.size,
    image: item.item_images?.[0]?.storage_path,
    publicStatus: item.public_status,
    recommended: isGenderMatch(item.gender, preferGender),
  }
}

export function WallOfKindness({ items, preferGender }: WallOfKindnessProps) {
  if (!items || items.length === 0) {
    return null
  }

  const featuredIndex = preferGender
    ? items.findIndex(
        (item) =>
          item.public_status === "available" && isGenderMatch(item.gender, preferGender),
      )
    : -1

  const featured = featuredIndex >= 0 ? items[featuredIndex] : null
  const rest = featuredIndex >= 0 ? items.filter((_, i) => i !== featuredIndex) : items

  return (
    <div className="flex flex-col gap-8 md:gap-10 pt-4 pb-6">
      {featured && (
        <div className="w-full max-w-md mx-auto md:mx-0 md:max-w-sm">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] mb-3 text-foreground">
            Picked for you
          </p>
          <WallOfKindnessCard
            tapeStyle={TAPE_STYLES[0]}
            featured
            item={toCardProps(featured, preferGender)}
          />
        </div>
      )}

      {rest.length > 0 && (
        <div>
          {featured && (
            <p className="text-[11px] font-black uppercase tracking-[0.2em] mb-4 text-foreground-muted">
              More on the wall
            </p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 md:gap-6 lg:gap-7">
            {rest.map((item, i) => (
              <WallOfKindnessCard
                key={item.id || i}
                tapeStyle={TAPE_STYLES[i % TAPE_STYLES.length]}
                item={toCardProps(item, preferGender)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

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
  /** Donor clothing preference — marks matching tiles with a FOR YOU stamp. */
  preferGender?: string | null
}

const TAPE_STYLES = [
  "-top-3 left-1/2 -translate-x-1/2 -rotate-2",
  "-top-3 left-6 -rotate-12",
  "-top-3 right-6 rotate-12",
  "-top-3 left-1/2 -translate-x-1/2 rotate-3"
]

export function WallOfKindness({ items, preferGender }: WallOfKindnessProps) {
  if (!items || items.length === 0) {
    return null
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 md:gap-6 lg:gap-7 pt-4 pb-6">
      {items.map((item, i) => (
        <WallOfKindnessCard
          key={item.id || i}
          tapeStyle={TAPE_STYLES[i % TAPE_STYLES.length]}
          item={{
            slug: item.slug,
            title: item.title,
            category: item.category,
            condition: item.condition,
            locality: item.locality,
            size: item.size,
            image: item.item_images?.[0]?.storage_path,
            publicStatus: item.public_status,
            recommended: isGenderMatch(item.gender, preferGender),
          }}
        />
      ))}
    </div>
  )
}

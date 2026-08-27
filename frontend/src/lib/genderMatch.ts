/** True when an item should be highlighted as a personal match for the donor's clothing preference. */
export function isGenderMatch(itemGender: string | null | undefined, prefGender: string | null | undefined): boolean {
  if (!prefGender || !itemGender) return false
  const item = itemGender.toLowerCase()
  const pref = prefGender.toLowerCase()
  if (item === pref) return true
  // Unisex pieces count as a soft match for men/women.
  if ((pref === "men" || pref === "women") && item === "unisex") return true
  return false
}

/** Sort recommended matches first; stable otherwise. */
export function sortByGenderMatch<T extends { gender?: string | null }>(
  items: T[],
  prefGender: string | null | undefined,
): T[] {
  if (!prefGender) return items
  return [...items].sort((a, b) => {
    const aMatch = isGenderMatch(a.gender, prefGender) ? 0 : 1
    const bMatch = isGenderMatch(b.gender, prefGender) ? 0 : 1
    return aMatch - bMatch
  })
}

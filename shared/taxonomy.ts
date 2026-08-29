/**
 * Launch taxonomy - shared by Give UI, Gemini prompts, and Zod validation.
 * Audience: Men / Women / Girls / Boys (+ unisex for bags/accessories).
 * Categories mirror client brief (Zara/Nike-style apparel drop).
 */

export const LAUNCH_CATEGORIES = [
  "Outerwear",
  "Tops",
  "Bottoms",
  "Kicks",
  "Bags",
  "Accessories",
] as const

export type LaunchCategory = (typeof LAUNCH_CATEGORIES)[number]

/** Categories that use XS-XL / Oversized apparel sizes. */
export const APPAREL_CATEGORIES: LaunchCategory[] = ["Outerwear", "Tops", "Bottoms"]

export const APPAREL_SIZES = ["XS", "S", "M", "L", "XL", "Oversized"] as const

export const ITEM_GENDERS = ["men", "women", "girls", "boys", "unisex"] as const
export type ItemGender = (typeof ITEM_GENDERS)[number]

/** Kids age bands (Zara/Nike-style). Shown when gender is girls or boys. */
export const KIDS_AGE_BANDS = [
  "0-12 months",
  "1-2 years",
  "3-4 years",
  "5-6 years",
  "7-8 years",
  "9-10 years",
  "11-12 years",
  "13-14 years",
] as const

/** Map legacy catalog values so wall filters still find older items. */
export function categoryFilterValues(selected: string): string[] | null {
  if (!selected || selected === "All") return null
  const map: Record<string, string[]> = {
    Outerwear: ["Outerwear"],
    Tops: ["Tops", "Clothing"],
    Bottoms: ["Bottoms", "Clothing"],
    Kicks: ["Kicks", "Footwear"],
    Bags: ["Bags"],
    Accessories: ["Accessories"],
    Clothing: ["Clothing", "Tops", "Bottoms", "Outerwear"],
    Footwear: ["Footwear", "Kicks"],
  }
  return map[selected] ?? [selected]
}

export function genderFilterValues(selected: string): string[] | null {
  if (!selected || selected === "All") return null
  const key = selected.toLowerCase()
  const map: Record<string, string[]> = {
    men: ["men"],
    women: ["women"],
    girls: ["girls", "kids"],
    boys: ["boys", "kids"],
    kids: ["kids", "girls", "boys"],
    unisex: ["unisex"],
  }
  return map[key] ?? [key]
}

/** Soft-normalize Gemini / legacy category strings into launch taxonomy. */
export function normalizeLaunchCategory(raw: string | null | undefined): LaunchCategory {
  const v = (raw || "").trim()
  if ((LAUNCH_CATEGORIES as readonly string[]).includes(v)) return v as LaunchCategory
  const lower = v.toLowerCase()
  if (lower.includes("shoe") || lower.includes("sneaker") || lower.includes("footwear") || lower === "kicks") return "Kicks"
  if (lower.includes("bag") || lower.includes("backpack")) return "Bags"
  if (lower.includes("jacket") || lower.includes("coat") || lower.includes("hoodie") || lower.includes("outer")) return "Outerwear"
  if (lower.includes("pant") || lower.includes("short") || lower.includes("skirt") || lower.includes("bottom") || lower.includes("jogger")) return "Bottoms"
  if (lower.includes("accessor") || lower.includes("hat") || lower.includes("cap") || lower.includes("belt") || lower.includes("scarf")) return "Accessories"
  if (lower === "clothing" || lower.includes("top") || lower.includes("tee") || lower.includes("shirt")) return "Tops"
  return "Tops"
}

export function normalizeItemGender(raw: string | null | undefined): ItemGender {
  const v = (raw || "").toLowerCase().trim()
  if (v === "men" || v === "women" || v === "girls" || v === "boys" || v === "unisex") return v
  if (v === "kids" || v === "kid" || v === "children") return "boys" // default; UI can correct
  return "unisex"
}

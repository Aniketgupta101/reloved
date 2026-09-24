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

/** Simple drop UI labels — avoid "Clothes"; use apparel / bags / shoes. */
export const DROP_CATEGORY_OPTIONS = [
  { label: "Apparel", value: "Tops" },
  { label: "Bags", value: "Bags" },
  { label: "Shoes", value: "Kicks" },
] as const

/** Audience options shown on Give form (Wall "For" filter). */
export const DROP_GENDER_OPTIONS = [
  { label: "Women", value: "women" },
  { label: "Men", value: "men" },
  { label: "Girls", value: "girls" },
  { label: "Boys", value: "boys" },
  { label: "Unisex", value: "unisex" },
] as const

export type LaunchCategory = (typeof LAUNCH_CATEGORIES)[number]

/** Categories that use standard letter sizes (apparel). */
export const APPAREL_CATEGORIES: LaunchCategory[] = ["Outerwear", "Tops", "Bottoms"]

/** Apparel + shoes require a size on drop (kids use age bands instead). */
export const SIZE_REQUIRED_CATEGORIES: LaunchCategory[] = ["Outerwear", "Tops", "Bottoms", "Kicks"]

/** Standard sizing — fit words like "Oversized" are not sizes. */
export const APPAREL_SIZES = ["XS", "S", "M", "L", "XL", "XXL/2XL", "3XL"] as const

/** Same letter sizes for shoes on drop (client standard list). */
export const SHOE_SIZES = APPAREL_SIZES

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
  if (v === "kids" || v === "kid" || v === "children") return "boys"
  return "unisex"
}

/** Map launch UI categories to the legacy storage / API enum still used by some backends. */
export function toStorageCategory(raw: string | null | undefined): "Clothing" | "Footwear" | "Bags" {
  const v = normalizeLaunchCategory(raw)
  if (v === "Kicks") return "Footwear"
  if (v === "Bags") return "Bags"
  return "Clothing" // Outerwear, Tops, Bottoms, Accessories
}

/** Map launch genders to older API values that only accept men|women|unisex|kids. */
export function toStorageGender(raw: string | null | undefined): "men" | "women" | "unisex" | "kids" {
  const v = normalizeItemGender(raw)
  if (v === "men" || v === "women" || v === "unisex") return v
  return "kids" // girls / boys
}

export const GIVER_LOGISTICS_OPTIONS = [
  "receiver_collects",
  "giver_sends",
  "porter_arranged",
] as const

/** Legacy value still present on older listings — treated like giver_sends. */
export type GiverLogistics = (typeof GIVER_LOGISTICS_OPTIONS)[number] | "personal_driver"

export const GIVER_LOGISTICS_LABELS: Record<(typeof GIVER_LOGISTICS_OPTIONS)[number], string> = {
  receiver_collects: "Receiver collects from my building gate",
  giver_sends: "I send it myself",
  porter_arranged: "Ops courier (manual)",
}

/** Labels for dropdowns — personal_driver removed from new picks. */
export const GIVER_LOGISTICS_PICK_OPTIONS = GIVER_LOGISTICS_OPTIONS

/** External courier (Shiprocket) is only used for this handover mode. */
export function usesExternalCourier(logistics: string | null | undefined): boolean {
  return logistics === "porter_arranged"
}

/** Legacy personal_driver is treated as self-send. */
export function usesPersonalDriver(logistics: string | null | undefined): boolean {
  return logistics === "personal_driver"
}

export function giverLogisticsLabel(logistics: string | null | undefined): string {
  if (logistics === "personal_driver") return GIVER_LOGISTICS_LABELS.giver_sends
  if (logistics && logistics in GIVER_LOGISTICS_LABELS) {
    return GIVER_LOGISTICS_LABELS[logistics as keyof typeof GIVER_LOGISTICS_LABELS]
  }
  return "Handover"
}

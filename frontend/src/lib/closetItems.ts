export const CLOSET_ITEMS = [
  { file: "IMG_6293.png", title: "Cream embroidered tunic", gender: "men", size: "Free size", description: "Lightweight long-sleeve tunic with grey geometric embroidery at the neck. Men's free size." },
  { file: "IMG_6299.png", title: "Black cargo trousers", gender: "men", size: "S", description: "Men's black cargo-style trousers with side pockets. Size S." },
  { file: "IMG_6301.png", title: "Grey H&M shorts", gender: "men", size: "32", description: "Men's dark grey textured shorts, waist 32." },
  { file: "IMG_6303.png", title: "Graphic V-neck tee", gender: "men", size: "S", description: "Dark grey V-neck t-shirt with distressed graphic print. Men's size S." },
  { file: "IMG_6310.png", title: "Abercrombie lime tee", gender: "men", size: "S", description: "Bright lime Abercrombie & Fitch t-shirt. Men's size S." },
  { file: "IMG_6311.png", title: "Marvel Hulk comic tee", gender: "men", size: "M", description: "Colour Hulk graphic t-shirt, Marvel. Men's size M." },
  { file: "IMG_6312.png", title: "Incredible Hulk tee", gender: "men", size: "M", description: "White Incredible Hulk illustration t-shirt. Men's size M." },
  { file: "IMG_6314.png", title: "Heather grey Henley", gender: "men", size: "M", description: "Long-sleeve heather grey Henley with roll-tab sleeves. Men's size M." },
  { file: "IMG_6316.png", title: "Abercrombie kids black tee", gender: "unisex", size: "Boys 17/18 yrs", description: "Black Abercrombie kids crew tee with moose logo. Boys 17/18 years." },
  { file: "IMG_6317.png", title: "Boys tee 11–12 yrs", gender: "unisex", size: "Boys XXS 11/12 yrs", description: "Boys t-shirt, XXS, ages 11–12." },
  { file: "IMG_6318.png", title: "Hunter x Hunter Hisoka tee", gender: "unisex", size: "Boys 10/12 yrs", description: "White tee with Hisoka playing-card graphic. Boys 10–12 years." },
  { file: "IMG_6320.png", title: "Boys tee 10–12 yrs", gender: "unisex", size: "Boys M 10/12 yrs", description: "Boys t-shirt, size M, ages 10–12." },
  { file: "IMG_6321.png", title: "Boys tee 5–6 yrs", gender: "unisex", size: "Boys 5/6 yrs", description: "Boys t-shirt, ages 5–6." },
  { file: "IMG_6322.png", title: "Boys tee 8–10 yrs", gender: "unisex", size: "Boys 8/10 yrs", description: "Boys t-shirt, ages 8–10." },
  { file: "IMG_6325.png", title: "Shark Water tee", gender: "unisex", size: "Boys 6/8 yrs", description: "Light tee with shark print and Shark Water lettering. Boys 6–8 years." },
  { file: "IMG_6327.png", title: "Batman sequin tee", gender: "unisex", size: "Boys 6/8 yrs", description: "Interactive sequin Batman t-shirt. Boys 6–8 years." },
  { file: "IMG_6328.png", title: "Boys tee 6–7 yrs", gender: "unisex", size: "Boys 6/7 yrs", description: "Boys t-shirt, ages 6–7." },
  { file: "IMG_6329.png", title: "Boys tee 6–7 yrs", gender: "unisex", size: "Boys 6/7 yrs", description: "Boys t-shirt, ages 6–7." },
  { file: "IMG_6330.png", title: "Boys tee 6 yrs", gender: "unisex", size: "Boys 6 yrs", description: "Boys t-shirt, age 6." },
  { file: "IMG_6331.png", title: "Boys tee 6 yrs", gender: "unisex", size: "Boys 6 yrs", description: "Boys t-shirt, age 6." },
  { file: "IMG_6332.png", title: "Boys tee 8–10 yrs", gender: "unisex", size: "Boys 8/10 yrs", description: "Boys t-shirt, ages 8–10." },
  { file: "IMG_6333.png", title: "Boys tee 7–8 yrs", gender: "unisex", size: "Boys 7/8 yrs", description: "Boys t-shirt, ages 7–8." },
  { file: "IMG_6334.png", title: "Boys tee 9 yrs", gender: "unisex", size: "Boys 9 yrs", description: "Boys t-shirt, age 9." },
  { file: "IMG_6336.png", title: "Boys tee 8 yrs", gender: "unisex", size: "Boys 8 yrs", description: "Boys t-shirt, age 8." },
  { file: "IMG_6337.png", title: "Boys tee 8–9 yrs", gender: "unisex", size: "Boys 8/9 yrs", description: "Boys t-shirt, ages 8–9." },
] as const

export type ClosetItem = (typeof CLOSET_ITEMS)[number]

export function closetSlug(file: string) {
  return file.replace(/\.png$/i, "").toLowerCase()
}

export function closetImageSrc(file: string) {
  return `/images/wall-items/${file}`
}

export function isCutoutPath(path?: string | null) {
  if (!path) return false
  return /wall-items\/IMG_|\bitems\/IMG_\d+\.png|\/IMG_\d+\.png/i.test(path)
}

export function findClosetItem(slug?: string | null) {
  if (!slug) return undefined
  const lower = slug.toLowerCase()
  return CLOSET_ITEMS.find((item) => {
    const id = closetSlug(item.file)
    return lower === id || lower.endsWith(`-${id}`)
  })
}

export function closetWallItems() {
  return CLOSET_ITEMS.map((item) => ({
    id: `closet-${closetSlug(item.file)}`,
    slug: closetSlug(item.file),
    title: item.title,
    category: "Clothing",
    condition: "Good",
    locality: "Mumbai",
    size: item.size,
    gender: item.gender,
    public_status: "available" as const,
    item_images: [{ storage_path: closetImageSrc(item.file) }],
  }))
}

export function closetDetail(item: ClosetItem) {
  return {
    id: `closet-${closetSlug(item.file)}`,
    slug: closetSlug(item.file),
    title: item.title,
    category: "Clothing",
    description: item.description,
    condition: "Good",
    size: item.size,
    gender: item.gender,
    quantity: 1,
    locality: "Mumbai",
    publicStatus: "available",
    donorRecognition: "Anonymous",
    images: [{ storagePath: closetImageSrc(item.file) }],
  }
}

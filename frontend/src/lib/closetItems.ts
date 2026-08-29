import { assetUrl } from "@/lib/assets"

export type ClosetPublicStatus = "available" | "being_matched" | "claimed" | "reloved"

export const CLOSET_ITEMS = [
  { file: "zanella-white-linen-embroidered-tunic.png", title: "Zanella White Linen Embroidered Tunic Top", gender: "men", size: "Free size", description: "This lightweight white linen tunic features intricate geometric embroidery around the V-neck, offering a relaxed yet stylish look. Its breezy fabric and long sleeves make it comfortable for warmer weather or as a layering piece.", status: "available" as ClosetPublicStatus },
  { file: "black-cargo-jogger-pants.png", title: "Black Cargo Jogger Pants", gender: "men", size: "S", description: "These comfortable black jogger-style cargo pants are perfect for casual wear or lounging. They feature a drawstring waist for an adjustable fit and practical cargo pockets on the sides.", status: "available" as ClosetPublicStatus },
  { file: "hm-grey-chino-shorts.png", title: "H&M Grey Button-Fly Chino Shorts", gender: "men", size: "32", description: "These stylish grey chino shorts feature a button fly closure and a classic flat-front design. They are versatile for casual everyday wear in warm weather, offering a smart yet relaxed look.", status: "available" as ClosetPublicStatus },
  { file: "distressed-grey-graphic-vneck-tee.png", title: "Distressed Grey Graphic V-Neck Tee", gender: "men", size: "S", description: "This dark grey V-neck t-shirt features a bold, distressed graphic print and a vintage-inspired look. It's a comfortable and casual top, perfect for everyday wear.", status: "available" as ClosetPublicStatus },
  { file: "black-long-sleeve-crewneck-tee.png", title: "Black Long-Sleeve Crewneck Tee", gender: "men", size: "S", description: "A comfortable, plain black long-sleeve t-shirt with a classic crewneck. This versatile piece is perfect for layering or wearing on its own for everyday comfort.", status: "available" as ClosetPublicStatus },
  { file: "abercrombie-green-af-ny-92-tee.png", title: "Abercrombie & Fitch Green AF NY 92 Tee", gender: "men", size: "S", description: "This vibrant green short-sleeve t-shirt features prominent 'AF NY 92' lettering with an elk graphic. A comfortable and casual top for everyday wear.", status: "available" as ClosetPublicStatus },
  { file: "marvel-hulk-comic-battles-tee.png", title: "Marvel Hulk Comic Battles Graphic Tee", gender: "men", size: "M", description: "This vibrant short-sleeved t-shirt features a bold, full-front graphic of the Incredible Hulk in action, designed like a classic comic book panel. It's a great casual top for any Marvel fan.", status: "available" as ClosetPublicStatus },
  { file: "hm-grey-henley-long-sleeve.png", title: "H&M Grey Henley Long Sleeve", gender: "men", size: "M", description: "This soft grey long-sleeve henley shirt from H&M features a three-button placket and button tabs on the sleeves. It's a comfortable and versatile piece for everyday casual wear.", status: "available" as ClosetPublicStatus },
  { file: "abercrombie-kids-black-moose-tee.png", title: "Abercrombie Kids Black Moose Tee", gender: "kids", size: "Boys 17/18 yrs", description: "Abercrombie kids crew tee with moose logo. Boys 17/18 years.", status: "available" as ClosetPublicStatus },
  { file: "hunter-x-hunter-hisoka-tee.png", title: "Hunter x Hunter Hisoka Graphic Tee", gender: "kids", size: "Boys XXS 11/12 yrs", description: "This white short-sleeve t-shirt features a striking graphic of Hisoka from Hunter x Hunter, holding playing cards. It's a comfortable and stylish top for any anime fan.", status: "available" as ClosetPublicStatus },
  { file: "surfs-on-graphic-tee.png", title: "Surf's On Graphic Tee", gender: "kids", size: "Boys 10/12 yrs", description: "This casual white t-shirt features a colorful 'Surf's On' graphic, perfect for a relaxed, beachy vibe. It appears lightly worn and ready for new adventures.", status: "available" as ClosetPublicStatus },
  { file: "dark-grey-zip-pocket-joggers.png", title: "Dark Grey Zip-Pocket Joggers", gender: "kids", size: "Boys M 10/12 yrs", description: "These dark grey joggers feature an elastic waist with a drawstring and practical zippered pockets. They are ideal for casual wear, lounging, or light activities.", status: "available" as ClosetPublicStatus },
  { file: "true-religion-grey-navy-block-tee.png", title: "True Religion Grey & Navy Block Tee", gender: "kids", size: "Boys 5/6 yrs", description: "A comfortable grey short-sleeved t-shirt featuring a bold navy blue chest stripe with TRUE RELIGION branding in yellow. This casual top is perfect for everyday wear.", status: "available" as ClosetPublicStatus },
  { file: "orca-print-navy-kids-tee.png", title: "Orca Print Navy Kids Tee", gender: "kids", size: "Boys 8/10 yrs", description: "Navy kids tee with an all-over orca print. Boys 8/10 years.", status: "available" as ClosetPublicStatus },
  { file: "shark-water-kids-tee.png", title: "Shark Water Kids Tee", gender: "kids", size: "Boys 6/8 yrs", description: "A fun white short-sleeved t-shirt with an all-over navy shark print and SHARK WATER in bold red text. Ideal for a child who loves marine creatures and playful styles.", status: "available" as ClosetPublicStatus },
  { file: "batman-interactive-sequin-tee.png", title: "Batman Interactive Sequin Tee", gender: "kids", size: "Boys 6/8 yrs", description: "Interactive sequin Batman t-shirt. Boys 6/8 years.", status: "available" as ClosetPublicStatus },
  { file: "polo-ralph-lauren-kids-navy-logo-tee.png", title: "Polo Ralph Lauren Kids Navy Logo Tee", gender: "kids", size: "Boys 6/7 yrs", description: "This navy t-shirt features a bold Polo Ralph Lauren logo on the front, perfect for a casual look. It's comfortable and ready for new adventures.", status: "available" as ClosetPublicStatus },
  { file: "kids-navy-crew-tee.png", title: "Kids Navy Crew Tee", gender: "kids", size: "Boys 6/7 yrs", description: "Kids navy crew tee. Boys 6/7 years.", status: "available" as ClosetPublicStatus },
  { file: "kids-soft-cotton-tee.png", title: "Kids Soft Cotton Tee", gender: "kids", size: "Boys 6 yrs", description: "Soft cotton kids tee. Age 6.", status: "available" as ClosetPublicStatus },
  { file: "kids-black-skeleton-dance-tee.png", title: "Kids Black Skeleton Dance Tee", gender: "kids", size: "Boys 6 yrs", description: "This fun black t-shirt features a playful white skeleton print that covers the lower half, giving the impression of dancing skeletons. Perfect for a casual, spooky, or everyday outfit.", status: "available" as ClosetPublicStatus },
  { file: "converse-camo-chuck-taylor-tee.png", title: "Converse Camo Chuck Taylor Tee", gender: "kids", size: "Boys 8/10 yrs", description: "Camo Converse Chuck Taylor All Star tee. Boys 8/10 years.", status: "available" as ClosetPublicStatus },
  { file: "abstract-grunge-print-kids-tee.png", title: "Abstract Grunge Print Kids Tee", gender: "kids", size: "Boys 7/8 yrs", description: "This short-sleeved t-shirt features a striking black and white abstract grunge pattern, perfect for a casual, edgy look. It appears comfortable and ready for everyday wear.", status: "available" as ClosetPublicStatus },
  { file: "kids-everyday-crew-tee.png", title: "Kids Everyday Crew Tee", gender: "kids", size: "Boys 9 yrs", description: "Everyday kids crew tee. Age 9.", status: "available" as ClosetPublicStatus },
  { file: "kids-classic-crew-tee.png", title: "Kids Classic Crew Tee", gender: "kids", size: "Boys 8 yrs", description: "Classic kids crew tee. Age 8.", status: "available" as ClosetPublicStatus },
  { file: "kids-character-pajama-set.png", title: "Kids Character Pajama Set", gender: "kids", size: "Boys 8/9 yrs", description: "Character print pajama set. Boys 8/9 years.", status: "available" as ClosetPublicStatus },
  { file: "spirit-halloween-baby-spider-costume.png", title: "Spirit Halloween Baby Spider Belly Costume", gender: "unisex", size: "2-4 yrs", description: "This is a cute baby/toddler spider costume, perfect for dress-up or Halloween. It includes a one-piece costume and a hood, appearing new and still sealed in its original packaging.", status: "available" as ClosetPublicStatus },
  { file: "lego-marvel-comics-baseball-cap.png", title: "LEGO Marvel Comics Baseball Cap", gender: "unisex", size: "Free size", description: "This black baseball cap features a vibrant all-over print of LEGO Marvel Comics characters, including Iron Man, Captain America, and The Hulk. It's a fun accessory for any young superhero fan.", status: "available" as ClosetPublicStatus },
  { file: "thor-avengers-superhero-costume.png", title: "Thor Avengers Superhero Costume with Cape", gender: "kids", size: "Boys 7-10 yrs", description: "This is a fun Thor costume, complete with a red cape, perfect for dress-up or parties. It features printed details mimicking armor and is ready for new adventures.", status: "available" as ClosetPublicStatus },
  { file: "teen-titans-robin-costume.png", title: "Teen Titans Go! Robin Costume", gender: "kids", size: "Boys 4/6 yrs", description: "This is a Robin costume for children, appearing new in its original packaging. It includes the jumpsuit with attached cape, eye mask, and belt, perfect for dress-up or Halloween fun.", status: "available" as ClosetPublicStatus },
  { file: "zara-lemon-ice-lolly-graphic-tee.png", title: "Zara Lemon Ice Lolly Graphic Tee", gender: "men", size: "M", description: "This bright yellow t-shirt features a fun 'Lemon Flavour Ice Lolly' graphic, perfect for summer. It's a casual and comfortable top for everyday wear.", status: "available" as ClosetPublicStatus },
  { file: "dont-tell-my-mom-graphic-tee.png", title: "Don't Tell My Mom Graphic Tee", gender: "kids", size: "Boys 6/7 yrs", description: "This casual black t-shirt features a fun and colorful 'Don't Tell My Mom' graphic with hearts. It's a playful top for everyday comfort.", status: "available" as ClosetPublicStatus },
  { file: "polo-ralph-lauren-bear-crest-tee.png", title: "Polo Ralph Lauren Bear Crest Tee", gender: "kids", size: "Boys 12 yrs", description: "Navy Polo Ralph Lauren tee with bear crest graphic. Boys 12 years.", status: "available" as ClosetPublicStatus },
] as const

export type ClosetItem = (typeof CLOSET_ITEMS)[number]

/** Title-based slug only - no camera-roll / asset numbers in URLs. */
export function closetSlug(item: Pick<ClosetItem, "title" | "file">) {
  return item.title
    .toLowerCase()
    .trim()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

export function closetImageSrc(file: string) {
  const stem = file.replace(/\.png$/i, "")
  // Local WebP thumbs (~20-80KB). Full PNG only on item detail via resolveImageUrl(..., { full: true }).
  return `/images/wall-items/thumbs/${stem}.webp`
}

export function isCutoutPath(path?: string | null) {
  if (!path) return false
  // Closet cutouts, Express uploads (`items/…` → `/uploads/items/…`), Firebase paths.
  return (
    /wall-items\//i.test(path) ||
    /(?:^|\/)(?:uploads\/)?items\//i.test(path)
  )
}

export function findClosetItem(slug?: string | null) {
  if (!slug) return undefined
  const lower = slug.toLowerCase()
  return CLOSET_ITEMS.find((item) => closetSlug(item) === lower)
}

export function closetWallItems() {
  return CLOSET_ITEMS.map((item) => ({
    id: `closet-${closetSlug(item)}`,
    slug: closetSlug(item),
    title: item.title,
    category: "Clothing",
    condition: "Good",
    locality: "Mumbai",
    size: item.size,
    gender: item.gender,
    public_status: item.status,
    item_images: [{ storage_path: closetImageSrc(item.file) }],
  }))
}

export function closetDetail(item: ClosetItem) {
  return {
    id: `closet-${closetSlug(item)}`,
    slug: closetSlug(item),
    title: item.title,
    category: "Clothing",
    description: item.description,
    condition: "Good",
    size: item.size,
    gender: item.gender,
    quantity: 1,
    locality: "Mumbai",
    publicStatus: item.status,
    donorRecognition: "Anonymous",
    images: [{ storagePath: closetImageSrc(item.file) }],
  }
}

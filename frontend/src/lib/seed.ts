// Static demo data used purely for homepage decoration (hero collage, map
// preview cards) - not wired to the backend. Real data comes from @/lib/api.
export const MOCK_ITEMS = [
  {
    id: "1",
    slug: "vintage-denim-jacket",
    title: "Vintage Levi's Denim Jacket",
    category: "Clothing",
    condition: "Good",
    locality: "Bandra",
    size: "M",
    quantity: 1,
    public_status: "available",
    public_visibility: true,
    description: "Classic blue denim jacket. Slightly faded but in great structural condition. Perfect for everyday wear.",
    item_images: [{ storage_path: "https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=800&q=80" }]
  },
  {
    id: "2",
    slug: "design-thinking-books",
    title: "Set of 3 Design Books",
    category: "Books & Learning",
    condition: "Excellent",
    locality: "Juhu",
    size: null,
    quantity: 1,
    public_status: "available",
    public_visibility: true,
    description: "Three books on design thinking and UX. Read once, practically brand new.",
    item_images: [{ storage_path: "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=800&q=80" }]
  },
  {
    id: "3",
    slug: "wood-dining-chairs",
    title: "Pair of Wooden Dining Chairs",
    category: "Home",
    condition: "Good",
    locality: "Andheri",
    size: null,
    quantity: 2,
    public_status: "being_matched",
    public_visibility: true,
    description: "Solid wood chairs with comfortable cushions. Minor scratches on the legs.",
    item_images: [{ storage_path: "https://images.unsplash.com/photo-1503602642458-232111445657?w=800&q=80" }]
  },
  {
    id: "4",
    slug: "acoustic-guitar",
    title: "Beginner Acoustic Guitar",
    category: "Art & Hobby",
    condition: "Fair but fully usable",
    locality: "Khar",
    size: null,
    quantity: 1,
    public_status: "available",
    public_visibility: true,
    description: "Great for learning. Missing one string but otherwise sounds fine.",
    item_images: [{ storage_path: "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=800&q=80" }]
  },
  {
    id: "5",
    slug: "running-shoes",
    title: "Athletic Running Shoes",
    category: "Footwear",
    condition: "Good",
    locality: "Colaba",
    size: "UK 9",
    quantity: 1,
    public_status: "reloved",
    public_visibility: true,
    description: "Used for a few months on indoor tracks. Plenty of tread left.",
    item_images: [{ storage_path: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&q=80" }]
  },
  {
    id: "6",
    slug: "summer-floral-dress",
    title: "Summer Floral Dress",
    category: "Clothing",
    condition: "Excellent",
    locality: "Powai",
    size: "M",
    quantity: 1,
    public_status: "available",
    public_visibility: true,
    description: "Light and breezy summer dress. Worn once for a daytime event.",
    item_images: [{ storage_path: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=800&q=80" }]
  },
  {
    id: "7",
    slug: "childrens-encyclopedia",
    title: "Children's Encyclopedia Set",
    category: "Books & Learning",
    condition: "Excellent",
    locality: "Chembur",
    size: null,
    quantity: 1,
    public_status: "available",
    public_visibility: true,
    description: "Full set of illustrated encyclopedias. Perfect for a school library.",
    item_images: [{ storage_path: "https://images.unsplash.com/photo-1532012197267-da84d127e765?w=800&q=80" }]
  },
  {
    id: "8",
    slug: "winter-sweaters",
    title: "Warm Winter Sweaters",
    category: "Clothing",
    condition: "Good",
    locality: "Malad",
    size: "L",
    quantity: 3,
    public_status: "reloved",
    public_visibility: true,
    description: "Three thick woolen sweaters. Washed and ready to wear.",
    item_images: [{ storage_path: "https://images.unsplash.com/photo-1576871337622-98d48d1cf531?w=800&q=80" }]
  },
  {
    id: "9",
    slug: "desk-lamp",
    title: "Minimalist Desk Lamp",
    category: "Home",
    condition: "Excellent",
    locality: "Dadar",
    size: null,
    quantity: 1,
    public_status: "available",
    public_visibility: true,
    description: "Metal desk lamp in perfect working condition. Comes with a warm bulb.",
    item_images: [{ storage_path: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800&q=80" }]
  },
  {
    id: "10",
    slug: "silk-scarf",
    title: "Patterned Silk Scarf",
    category: "Accessories",
    condition: "Good",
    locality: "South Mumbai",
    size: "One Size",
    quantity: 1,
    public_status: "available",
    public_visibility: true,
    description: "Colorful vintage silk scarf. Has a tiny pull on one edge but hardly noticeable.",
    item_images: [{ storage_path: "https://images.unsplash.com/photo-1601924994987-69e26d50dc26?w=800&auto=format&fit=crop&q=80" }]
  },
  {
    id: "11",
    slug: "leather-boots",
    title: "Black Leather Boots",
    category: "Footwear",
    condition: "Fair but fully usable",
    locality: "Bandra",
    size: "UK 8",
    quantity: 1,
    public_status: "being_matched",
    public_visibility: true,
    description: "Well-worn leather boots. Very comfortable and still have good soles.",
    item_images: [{ storage_path: "https://images.unsplash.com/photo-1608256246200-53e635b5b65f?w=800&q=80" }]
  },
  {
    id: "12",
    slug: "paintbrush-set",
    title: "Professional Paintbrush Set",
    category: "Art & Hobby",
    condition: "Excellent",
    locality: "Thane",
    size: null,
    quantity: 1,
    public_status: "available",
    public_visibility: true,
    description: "Set of 10 assorted brushes. Barely used.",
    item_images: [{ storage_path: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=800&q=80" }]
  }
]

export const MOCK_TRACKING = {
  reference: "A1B2C3D4",
  status: "approved",
  submitted_at: new Date().toISOString(),
  items: [
    { id: "1", title: "Vintage Levi's Denim Jacket", category: "Clothing", status: "approved" },
    { id: "8", title: "Warm Winter Sweaters", category: "Clothing", status: "reloved" }
  ]
}



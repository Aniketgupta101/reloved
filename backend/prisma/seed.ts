import "dotenv/config"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// Same 12 items that used to live in frontend/src/lib/seed.ts as Firestore
// mock data — now real rows. Images point at Unsplash placeholders since
// there's no real donor photo to run through the upload pipeline for seed data.
const MOCK_ITEMS = [
  { title: "Vintage Levi's Denim Jacket", category: "Clothing", condition: "Good", locality: "Bandra", size: "M", quantity: 1, publicStatus: "available", description: "Classic blue denim jacket. Slightly faded but in great structural condition. Perfect for everyday wear.", image: "https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=800&q=80" },
  { title: "Set of 3 Design Books", category: "Books & Learning", condition: "Excellent", locality: "Juhu", size: null, quantity: 1, publicStatus: "available", description: "Three books on design thinking and UX. Read once, practically brand new.", image: "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=800&q=80" },
  { title: "Pair of Wooden Dining Chairs", category: "Home", condition: "Good", locality: "Andheri", size: null, quantity: 2, publicStatus: "being_matched", description: "Solid wood chairs with comfortable cushions. Minor scratches on the legs.", image: "https://images.unsplash.com/photo-1503602642458-232111445657?w=800&q=80" },
  { title: "Beginner Acoustic Guitar", category: "Art & Hobby", condition: "Fair but fully usable", locality: "Khar", size: null, quantity: 1, publicStatus: "available", description: "Great for learning. Missing one string but otherwise sounds fine.", image: "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=800&q=80" },
  { title: "Athletic Running Shoes", category: "Footwear", condition: "Good", locality: "Colaba", size: "UK 9", quantity: 1, publicStatus: "reloved", description: "Used for a few months on indoor tracks. Plenty of tread left.", image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&q=80" },
  { title: "Summer Floral Dress", category: "Clothing", condition: "Excellent", locality: "Powai", size: "M", quantity: 1, publicStatus: "available", description: "Light and breezy summer dress. Worn once for a daytime event.", image: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=800&q=80" },
  { title: "Children's Encyclopedia Set", category: "Books & Learning", condition: "Excellent", locality: "Chembur", size: null, quantity: 1, publicStatus: "available", description: "Full set of illustrated encyclopedias. Perfect for a school library.", image: "https://images.unsplash.com/photo-1532012197267-da84d127e765?w=800&q=80" },
  { title: "Warm Winter Sweaters", category: "Clothing", condition: "Good", locality: "Malad", size: "L", quantity: 3, publicStatus: "reloved", description: "Three thick woolen sweaters. Washed and ready to wear.", image: "https://images.unsplash.com/photo-1576871337622-98d48d1cf531?w=800&q=80" },
  { title: "Minimalist Desk Lamp", category: "Home", condition: "Excellent", locality: "Dadar", size: null, quantity: 1, publicStatus: "available", description: "Metal desk lamp in perfect working condition. Comes with a warm bulb.", image: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800&q=80" },
  { title: "Patterned Silk Scarf", category: "Accessories", condition: "Good", locality: "South Mumbai", size: "One Size", quantity: 1, publicStatus: "available", description: "Colorful vintage silk scarf. Has a tiny pull on one edge but hardly noticeable.", image: "https://images.unsplash.com/photo-1601924994987-69e26d50dc26?w=800&auto=format&fit=crop&q=80" },
  { title: "Black Leather Boots", category: "Footwear", condition: "Fair but fully usable", locality: "Bandra", size: "UK 8", quantity: 1, publicStatus: "being_matched", description: "Well-worn leather boots. Very comfortable and still have good soles.", image: "https://images.unsplash.com/photo-1608256246200-53e635b5b65f?w=800&q=80" },
  { title: "Professional Paintbrush Set", category: "Art & Hobby", condition: "Excellent", locality: "Thane", size: null, quantity: 1, publicStatus: "available", description: "Set of 10 assorted brushes. Barely used.", image: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=800&q=80" },
]

function slugify(title: string, i: number) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + i
}

async function main() {
  const existing = await prisma.item.count()
  if (existing > 0) {
    console.log(`Skipping seed — ${existing} items already exist.`)
    return
  }

  const submission = await prisma.donationSubmission.create({
    data: {
      reference: "A1B2C3D4",
      donorFirstName: "Kindness",
      donorLastName: "Donor",
      phone: "9999999999",
      email: "donor@reloved.org",
      locality: "Bandra",
      status: "approved",
    },
  })

  for (const [i, mock] of MOCK_ITEMS.entries()) {
    await prisma.item.create({
      data: {
        submissionId: submission.id,
        slug: slugify(mock.title, i),
        title: mock.title,
        category: mock.category,
        condition: mock.condition,
        size: mock.size,
        quantity: mock.quantity,
        description: mock.description,
        locality: mock.locality,
        status: "approved",
        publicStatus: mock.publicStatus,
        publicVisibility: true,
        donorRecognition: "Anonymous",
        images: { create: [{ storagePath: mock.image, sortOrder: 0 }] },
      },
    })
  }

  console.log(`Seeded ${MOCK_ITEMS.length} items.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

import "dotenv/config"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const CLOSET_ITEMS = [
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
  { file: "IMG_6334.png", title: "Boys tee 9 yrs", gender: "unisex", size: "Boys 9 yrs", description: "Boys t-shirt, age 9." },
  { file: "IMG_6336.png", title: "Boys tee 8 yrs", gender: "unisex", size: "Boys 8 yrs", description: "Boys t-shirt, age 8." },
  { file: "IMG_6337.png", title: "Boys tee 8–9 yrs", gender: "unisex", size: "Boys 8/9 yrs", description: "Boys t-shirt, ages 8–9." },
]

function slugify(file: string) {
  return file.replace(/\.png$/i, "").toLowerCase()
}

async function main() {
  const submission = await prisma.donationSubmission.upsert({
    where: { reference: "CLOSET-AUG-2026" },
    create: {
      reference: "CLOSET-AUG-2026",
      donorFirstName: "Reloved",
      donorLastName: "Closet",
      phone: "0000000000",
      email: "hello@reloved.digital",
      locality: "Mumbai",
      status: "approved",
      recognitionPreference: "anonymous",
    },
    update: {},
  })

  for (const item of CLOSET_ITEMS) {
    const slug = slugify(item.file)
    const existing = await prisma.item.findUnique({ where: { slug } })
    if (existing) {
      console.log("skip", slug)
      continue
    }
    await prisma.item.create({
      data: {
        submissionId: submission.id,
        slug,
        title: item.title,
        category: "Clothing",
        description: item.description,
        condition: "Good",
        size: item.size,
        gender: item.gender,
        quantity: 1,
        locality: "Mumbai",
        status: "approved",
        publicStatus: "available",
        publicVisibility: true,
        donorRecognition: "Anonymous",
        images: { create: [{ storagePath: `items/${item.file}`, sortOrder: 0 }] },
      },
    })
    console.log("created", slug)
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

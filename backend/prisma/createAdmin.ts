import "dotenv/config"
import { PrismaClient } from "@prisma/client"
import { hashPassword } from "../server/lib/auth.js"

const prisma = new PrismaClient()

async function main() {
  const [, , email, password, firstName] = process.argv
  if (!email || !password) {
    console.error("Usage: npm run db:create-admin -- <email> <password> [firstName]")
    process.exit(1)
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.")
    process.exit(1)
  }

  const passwordHash = await hashPassword(password)

  const profile = await prisma.profile.upsert({
    where: { email: email.toLowerCase().trim() },
    create: { email: email.toLowerCase().trim(), passwordHash, role: "admin", firstName: firstName || null },
    update: { passwordHash },
  })

  console.log(`Admin account ready: ${profile.email}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

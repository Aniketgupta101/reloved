import { randomBytes } from "crypto"

export function generateReference(prefix?: string): string {
  const code = randomBytes(5).toString("hex").toUpperCase().slice(0, 8)
  return prefix ? `${prefix}-${code}` : code
}

export function slugify(title: string): string {
  const base = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
  const suffix = randomBytes(3).toString("hex")
  return `${base || "item"}-${suffix}`
}

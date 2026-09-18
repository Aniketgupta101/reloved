/**
 * Lightweight identity + self-claim rules (no Firestore).
 * Run: npx tsx src/scripts/testSelfClaimIdentity.ts
 */
import { normalizeEmail, normalizePhoneDigits } from "../lib/donorIdentity"

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg)
}

function samePersonWouldBlock(opts: {
  sessionTarget: string
  profileEmail?: string | null
  profilePhone?: string | null
  donorTarget?: string | null
  submissionEmail?: string | null
  submissionPhone?: string | null
}): boolean {
  const targetEmail = normalizeEmail(opts.sessionTarget)
  const targetPhone = normalizePhoneDigits(opts.sessionTarget)
  const identityEmails = new Set(
    [targetEmail, normalizeEmail(opts.profileEmail)].filter(Boolean) as string[]
  )
  const identityPhones = new Set(
    [targetPhone, normalizePhoneDigits(opts.profilePhone)].filter(Boolean) as string[]
  )
  const donorTarget = opts.donorTarget || null
  if (donorTarget && String(donorTarget).trim() === String(opts.sessionTarget).trim()) return true
  if (donorTarget && targetEmail && normalizeEmail(donorTarget) === targetEmail) return true
  if (donorTarget && targetPhone && normalizePhoneDigits(donorTarget) === targetPhone) return true
  const subEmail = normalizeEmail(opts.submissionEmail)
  const subPhone = normalizePhoneDigits(opts.submissionPhone) || normalizePhoneDigits(donorTarget)
  if (subEmail && identityEmails.has(subEmail)) return true
  if (subPhone && identityPhones.has(subPhone)) return true
  return false
}

assert(normalizeEmail("  Foo@Bar.COM ") === "foo@bar.com", "email normalize")
assert(normalizePhoneDigits("+91 98765-43210") === "9876543210", "phone normalize")
assert(normalizePhoneDigits("09876543210") === "9876543210", "phone last10")

// Gave with email session, claim with same email → block
assert(
  samePersonWouldBlock({
    sessionTarget: "giver@reloved.digital",
    donorTarget: "giver@reloved.digital",
  }),
  "exact email donorTarget"
)

// Gave with phone as donorTarget, claim with email profile that has same phone → block
assert(
  samePersonWouldBlock({
    sessionTarget: "giver@reloved.digital",
    profileEmail: "giver@reloved.digital",
    profilePhone: "9876543210",
    donorTarget: "9876543210",
    submissionPhone: "9876543210",
  }),
  "email session vs phone donorTarget via profile phone"
)

// Gave with email, claim with phone session matching submission phone → block
assert(
  samePersonWouldBlock({
    sessionTarget: "9876543210",
    profilePhone: "9876543210",
    donorTarget: "giver@reloved.digital",
    submissionEmail: "giver@reloved.digital",
    submissionPhone: "9876543210",
  }),
  "phone session vs email listing via submission phone"
)

// Different person same phone number on claimer form is NOT what we test here —
// different emails + different session → allow
assert(
  !samePersonWouldBlock({
    sessionTarget: "claimer@reloved.digital",
    profileEmail: "claimer@reloved.digital",
    profilePhone: "9123456789",
    donorTarget: "giver@reloved.digital",
    submissionEmail: "giver@reloved.digital",
    submissionPhone: "9876543210",
  }),
  "unrelated claimer allowed"
)

console.log("ok - self-claim identity rules")

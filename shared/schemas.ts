import { z } from "zod"

export const donationItemSchema = z.object({
  itemTitle: z.string().min(2).max(120),
  category: z.string().min(1),
  description: z.string().min(5).max(2000),
  condition: z.string().min(1),
  size: z.string().max(60).optional().or(z.literal("")),
  quantity: z.coerce.number().int().min(1).max(50),
  brand: z.string().max(80).optional().or(z.literal("")),
  age: z.string().max(80).optional().or(z.literal("")),
  defect: z.string().max(500).optional().or(z.literal("")),
})

export const donationSchema = donationItemSchema.extend({
  firstName: z.string().min(1).max(80),
  lastName: z.string().max(80).optional().or(z.literal("")),
  phone: z.string().min(7).max(20),
  email: z.string().email().optional().or(z.literal("")),
  contactMethod: z.enum(["WhatsApp", "Phone Call", "Email"]),
  recognitionPreference: z.enum(["name", "anonymous"]),
  // "delivery_partner" isn't live yet — UI shows it as "Coming soon" but still records donor interest.
  handoverMethod: z.enum(["self", "delivery_partner"]).default("self"),
  pickupLocality: z.string().min(2).max(120),
  dateRange: z.string().max(120).optional().or(z.literal("")),
  timeWindow: z.string().max(120).optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
  // multipart/form-data always sends string values, so this arrives as "true", not boolean true.
  declaration: z.union([z.literal(true), z.literal("true")]),
  // JSON-encoded array of storage paths for photos already processed by
  // POST /donations/analyze-photos (background-removed onto white).
  photoStoragePaths: z.string().max(4000).optional().or(z.literal("")),
})

export const partnerApplicationSchema = z.object({
  orgName: z.string().min(2).max(160),
  orgType: z.string().min(1),
  registrationStatus: z.string().min(1),
  contactPerson: z.string().min(1).max(120),
  role: z.string().max(120).optional().or(z.literal("")),
  phone: z.string().min(7).max(20),
  email: z.string().email(),
  locality: z.string().min(2).max(160),
  beneficiaryGroup: z.string().max(200).optional().or(z.literal("")),
  requiredCategories: z.array(z.string()).min(1),
  approxQuantity: z.string().max(120).optional().or(z.literal("")),
  message: z.string().max(2000).optional().or(z.literal("")),
  consent: z.literal(true),
})

export const contactMessageSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  phone: z.string().max(20).optional().or(z.literal("")),
  subject: z.string().max(160).optional().or(z.literal("")),
  message: z.string().min(1).max(3000),
})

export const otpRequestSchema = z.object({
  channel: z.enum(["sms", "email"]),
  target: z.string().min(3).max(120),
})

export const otpVerifySchema = z.object({
  channel: z.enum(["sms", "email"]),
  target: z.string().min(3).max(120),
  code: z.string().length(6),
})

export const bulkUploadCommitItemSchema = z.object({
  storagePath: z.string().min(1),
  title: z.string().min(2).max(120),
  category: z.string().min(1),
  description: z.string().min(1).max(2000),
  condition: z.string().min(1),
  brand: z.string().max(80).optional().nullable(),
  size: z.string().max(60).optional().nullable(),
  quantity: z.coerce.number().int().min(1).max(50).optional(),
  locality: z.string().min(2).max(120),
})

export const bulkUploadCommitSchema = z.object({
  items: z.array(bulkUploadCommitItemSchema).min(1).max(20),
})

// Donor login is passwordless — reuses otpRequestSchema/otpVerifySchema
// above to send/check the code, then this to exchange a verified OTP for a
// session.
export const donorSessionSchema = z.object({
  channel: z.enum(["sms", "email"]),
  target: z.string().min(3).max(120),
})

export const partnerLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const partnerRequestSchema = z.object({
  items: z.array(z.object({ itemId: z.string().min(1), quantity: z.coerce.number().int().min(1).max(3) })).min(1).max(3),
})

// Donor onboarding — one-time, after first login. Phone here is just a
// plain field with no verification; two-step number verification is a
// deliberate later step, not built yet.
export const donorProfileSchema = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().min(7).max(20),
  address: z.string().min(1).max(300),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
})

// A logged-in user requesting to take one specific item directly —
// deliberately separate from partner-applications/allocations. Multipart
// (optional photo), so values arrive as strings.
export const itemRequestSchema = z.object({
  itemId: z.string().min(1),
  requesterName: z.string().min(1).max(120),
  requesterPhone: z.string().min(7).max(20),
  requesterAddress: z.string().min(1).max(300),
  note: z.string().max(1000).optional().or(z.literal("")),
})

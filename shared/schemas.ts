import { z } from "zod"
import { ITEM_GENDERS, LAUNCH_CATEGORIES, GIVER_LOGISTICS_OPTIONS } from "./taxonomy.js"

export { LAUNCH_CATEGORIES, ITEM_GENDERS } from "./taxonomy.js"
export {
  APPAREL_CATEGORIES,
  APPAREL_SIZES,
  KIDS_AGE_BANDS,
  categoryFilterValues,
  genderFilterValues,
  normalizeLaunchCategory,
  normalizeItemGender,
} from "./taxonomy.js"

// Indian mobile number: exactly 10 digits, starting 6-9 — real numbers, not
// just "7+ characters" (which let through things like an 11-digit typo).
// Frontend strips spaces/dashes/+91/leading 0 before submitting, so this
// only ever needs to check the raw 10 digits.
const PHONE_REGEX = /^[6-9]\d{9}$/
const phoneSchema = z.string().regex(PHONE_REGEX, "Enter a valid 10-digit mobile number")

export const donationItemSchema = z.object({
  itemTitle: z.string().min(2).max(120),
  category: z.enum(LAUNCH_CATEGORIES),
  gender: z.enum(ITEM_GENDERS),
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
  phone: phoneSchema,
  email: z.string().email().optional().or(z.literal("")),
  contactMethod: z.enum(["WhatsApp", "Phone Call", "Email"]),
  recognitionPreference: z.enum(["name", "anonymous", "alias"]),
  aliasName: z.string().max(60).optional().or(z.literal("")),
  giverLogistics: z.enum(GIVER_LOGISTICS_OPTIONS).default("receiver_collects"),
  /** Where the item should be delivered — required when giverLogistics is giver_sends. */
  deliveryAddress: z.string().max(300).optional().or(z.literal("")),
  /** Who pays porter cost — required when giverLogistics is porter_arranged. */
  porterPaidBy: z.enum(["receiver", "giver"]).optional(),
  pickupLocality: z.string().max(120).optional().or(z.literal("")),
  dateRange: z.string().max(120).optional().or(z.literal("")),
  timeWindow: z.string().max(120).optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
  // Quality declaration + T&C accept (multipart sends "true" strings).
  declaration: z.union([z.literal(true), z.literal("true")]),
  acceptedTerms: z.union([z.literal(true), z.literal("true")]),
  photoStoragePaths: z.string().max(4000).optional().or(z.literal("")),
}).superRefine((data, ctx) => {
  if (data.giverLogistics === "receiver_collects") {
    if (!data.pickupLocality?.trim() || data.pickupLocality.trim().length < 2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Pickup address is required.", path: ["pickupLocality"] })
    }
    if (!data.dateRange?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Preferred date range is required.", path: ["dateRange"] })
    }
    if (!data.timeWindow?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Preferred time window is required.", path: ["timeWindow"] })
    }
  }
  if (data.giverLogistics === "giver_sends") {
    if (!data.deliveryAddress?.trim() || data.deliveryAddress.trim().length < 2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Delivery address is required.", path: ["deliveryAddress"] })
    }
  }
  if (data.giverLogistics === "porter_arranged" && !data.porterPaidBy) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Choose who pays for the porter.", path: ["porterPaidBy"] })
  }
})

export const partnerApplicationSchema = z.object({
  orgName: z.string().min(2).max(160),
  orgType: z.string().min(1),
  registrationStatus: z.string().min(1),
  contactPerson: z.string().min(1).max(120),
  role: z.string().max(120).optional().or(z.literal("")),
  phone: phoneSchema,
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
  phone: phoneSchema.optional().or(z.literal("")),
  subject: z.string().max(160).optional().or(z.literal("")),
  message: z.string().min(1).max(3000),
})

/** Coming-soon waitlist: email AND phone required (no OTP). Name optional. */
export const waitlistSignupSchema = z.object({
  fullName: z.string().max(120).trim().optional().or(z.literal("")),
  email: z.string().email().max(160).trim().toLowerCase(),
  phone: z
    .string()
    .trim()
    .regex(PHONE_REGEX, "Enter a valid 10-digit mobile number"),
  intent: z.enum(["donate", "claim"]),
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

export const otpWidgetVerifySchema = z.object({
  target: z.string().min(3).max(120),
  accessToken: z.string().min(1),
})

export const bulkUploadCommitItemSchema = z.object({
  storagePath: z.string().min(1),
  title: z.string().min(2).max(120),
  category: z.enum(LAUNCH_CATEGORIES),
  gender: z.enum(ITEM_GENDERS).default("unisex"),
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

export const donorProfileSchema = z.object({
  name: z.string().min(1).max(120),
  username: z
    .string()
    .min(2)
    .max(32)
    .regex(/^[a-zA-Z0-9._]+$/, "Username can only use letters, numbers, . and _"),
  gender: z.enum(ITEM_GENDERS),
  phone: phoneSchema,
  address: z.string().min(1).max(300),
  addressLabel: z.enum(["home", "office", "other"]).optional().nullable(),
  pincode: z.string().regex(/^\d{6}$/, "Enter a valid 6-digit pincode").optional().or(z.literal("")).nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
})

export const itemRequestSchema = z.object({
  itemId: z.string().min(1),
  requesterName: z.string().min(1).max(120),
  requesterPhone: phoneSchema,
  requesterAddress: z.string().min(1).max(300),
  note: z.string().max(1000).optional().or(z.literal("")),
  acceptedTerms: z.union([z.literal(true), z.literal("true")]),
  personalUse: z.union([z.literal(true), z.literal("true")]),
})

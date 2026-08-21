import { prisma } from "./prisma.js"

export const OTP_VERIFIED_WINDOW_MINUTES = 30

/** True if `target` (phone or email) completed /api/otp/verify within the last OTP_VERIFIED_WINDOW_MINUTES. */
export async function isRecentlyVerified(target: string): Promise<boolean> {
  const record = await prisma.otpCode.findFirst({
    where: {
      target,
      verifiedAt: { gte: new Date(Date.now() - OTP_VERIFIED_WINDOW_MINUTES * 60 * 1000) },
    },
    orderBy: { verifiedAt: "desc" },
  })
  return Boolean(record)
}

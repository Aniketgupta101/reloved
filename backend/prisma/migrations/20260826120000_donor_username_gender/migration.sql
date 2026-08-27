-- AlterTable
ALTER TABLE "donor_profiles" ADD COLUMN IF NOT EXISTS "username" TEXT;
ALTER TABLE "donor_profiles" ADD COLUMN IF NOT EXISTS "gender" TEXT;

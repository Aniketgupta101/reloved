-- Waitlist: email OR phone, optional name, donate/claim intent
ALTER TABLE "waitlist_signups" ALTER COLUMN "full_name" DROP NOT NULL;
ALTER TABLE "waitlist_signups" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "waitlist_signups" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "waitlist_signups" ADD COLUMN IF NOT EXISTS "intent" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "waitlist_signups_phone_key" ON "waitlist_signups"("phone");

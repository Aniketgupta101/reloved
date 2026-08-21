-- DropIndex
DROP INDEX "profiles_auth_user_id_key";

-- AlterTable
ALTER TABLE "partner_applications" DROP COLUMN "required_categories",
ADD COLUMN     "required_categories" JSONB NOT NULL;

-- AlterTable
ALTER TABLE "profiles" DROP COLUMN "auth_user_id",
ADD COLUMN     "password_hash" TEXT NOT NULL,
ALTER COLUMN "role" SET DEFAULT 'admin',
ALTER COLUMN "email" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "profiles_email_key" ON "profiles"("email");


-- AlterTable
ALTER TABLE "partners" ADD COLUMN     "password_hash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "partners_email_key" ON "partners"("email");


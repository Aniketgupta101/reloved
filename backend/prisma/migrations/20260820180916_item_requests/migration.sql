-- CreateTable
CREATE TABLE "item_requests" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "requester_target" TEXT NOT NULL,
    "requester_name" TEXT,
    "requester_phone" TEXT,
    "requester_address" TEXT,
    "note" TEXT,
    "photo_storage_path" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_requests_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "item_requests" ADD CONSTRAINT "item_requests_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;


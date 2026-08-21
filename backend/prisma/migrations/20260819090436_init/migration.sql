-- CreateTable
CREATE TABLE "profiles" (
    "id" TEXT NOT NULL,
    "auth_user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'operator',
    "first_name" TEXT,
    "last_name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donation_submissions" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "donor_first_name" TEXT NOT NULL,
    "donor_last_name" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "locality" TEXT NOT NULL,
    "preferred_contact_method" TEXT NOT NULL DEFAULT 'WhatsApp',
    "recognition_preference" TEXT NOT NULL DEFAULT 'anonymous',
    "date_range" TEXT,
    "time_window" TEXT,
    "coordination_notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "internal_notes" TEXT,
    "otp_verified_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "donation_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "approved_quantity" INTEGER,
    "brand" TEXT,
    "size" TEXT,
    "dimensions" TEXT,
    "condition" TEXT NOT NULL,
    "approximate_age" TEXT,
    "defect_notes" TEXT,
    "locality" TEXT NOT NULL,
    "donor_recognition" TEXT,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "public_status" TEXT NOT NULL DEFAULT 'available',
    "public_visibility" BOOLEAN NOT NULL DEFAULT false,
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_images" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "image_type" TEXT NOT NULL DEFAULT 'product',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_applications" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "organisation_name" TEXT NOT NULL,
    "organisation_type" TEXT NOT NULL,
    "registration_status" TEXT NOT NULL,
    "registration_number" TEXT,
    "website" TEXT,
    "contact_name" TEXT NOT NULL,
    "contact_role" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "locality" TEXT NOT NULL,
    "beneficiary_profile" TEXT,
    "estimated_beneficiaries" INTEGER,
    "required_categories" TEXT[],
    "estimated_quantities" TEXT,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "verification_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partners" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "organisation_name" TEXT NOT NULL,
    "organisation_type" TEXT NOT NULL,
    "primary_contact" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "locality" TEXT NOT NULL,
    "verification_status" TEXT NOT NULL DEFAULT 'verified',
    "public_visibility" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_needs" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "item_type" TEXT NOT NULL,
    "quantity_required" INTEGER NOT NULL,
    "quantity_fulfilled" INTEGER NOT NULL DEFAULT 0,
    "size" TEXT,
    "age_group" TEXT,
    "urgency" TEXT NOT NULL DEFAULT 'normal',
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_needs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allocations" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "operational_notes" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allocation_items" (
    "id" TEXT NOT NULL,
    "allocation_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "allocated_quantity" INTEGER NOT NULL,
    "completed_quantity" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "allocation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_records" (
    "id" TEXT NOT NULL,
    "allocation_id" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "evidence_type" TEXT NOT NULL DEFAULT 'completion',
    "consent_status" TEXT NOT NULL DEFAULT 'pending',
    "public_visibility" BOOLEAN NOT NULL DEFAULT false,
    "minor_involved" BOOLEAN NOT NULL DEFAULT false,
    "guardian_or_institution_consent" BOOLEAN NOT NULL DEFAULT false,
    "completion_note" TEXT,
    "captured_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "previous_state" JSONB,
    "new_state" JSONB,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_messages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "subject" TEXT NOT NULL DEFAULT 'General Inquiry',
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_codes" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profiles_auth_user_id_key" ON "profiles"("auth_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "donation_submissions_reference_key" ON "donation_submissions"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "items_slug_key" ON "items"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "partner_applications_reference_key" ON "partner_applications"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "partners_application_id_key" ON "partners"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "allocations_reference_key" ON "allocations"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "app_settings_key_key" ON "app_settings"("key");

-- CreateIndex
CREATE INDEX "otp_codes_target_channel_idx" ON "otp_codes"("target", "channel");

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "donation_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_images" ADD CONSTRAINT "item_images_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "partner_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_needs" ADD CONSTRAINT "partner_needs_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation_items" ADD CONSTRAINT "allocation_items_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "allocations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocation_items" ADD CONSTRAINT "allocation_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_records" ADD CONSTRAINT "evidence_records_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "allocations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

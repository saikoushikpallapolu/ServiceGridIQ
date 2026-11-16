BEGIN;
-- CreateEnum
CREATE TYPE "PartRequirementState" AS ENUM ('SUSPECTED', 'REQUIRED', 'NOT_NEEDED');

-- CreateEnum
CREATE TYPE "EvidenceStatus" AS ENUM ('CONFIRMED', 'UNAVAILABLE', 'UNKNOWN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JobStatus" ADD VALUE 'READY';
ALTER TYPE "JobStatus" ADD VALUE 'ASSIGNED';

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "parts_freshness_hours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "preparation_policy_version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "parts_reviewed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "planned_start" TIMESTAMPTZ(3),
ADD COLUMN     "prerequisites_reviewed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ready_snapshot" JSONB,
ADD COLUMN     "service_category" TEXT NOT NULL DEFAULT 'GENERAL_SERVICE',
ADD COLUMN     "visit_revision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "warning_acknowledgments" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "parts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,

    CONSTRAINT "parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_locations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,

    CONSTRAINT "stock_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_parts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "part_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "state" "PartRequirementState" NOT NULL,
    "reason" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "job_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "part_confirmations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "job_part_id" UUID NOT NULL,
    "recorded_job_version" INTEGER NOT NULL,
    "requirement_revision" INTEGER NOT NULL,
    "visit_revision" INTEGER NOT NULL,
    "planned_start" TIMESTAMPTZ(3) NOT NULL,
    "status" "EvidenceStatus" NOT NULL,
    "note" TEXT NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_by_membership_id" UUID NOT NULL,

    CONSTRAINT "part_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_prerequisites" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,

    CONSTRAINT "job_prerequisites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prerequisite_evidence" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "prerequisite_id" UUID NOT NULL,
    "recorded_job_version" INTEGER NOT NULL,
    "visit_revision" INTEGER NOT NULL,
    "planned_start" TIMESTAMPTZ(3) NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "verified_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_by_membership_id" UUID NOT NULL,

    CONSTRAINT "prerequisite_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "technician_id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "approved_by_membership_id" UUID NOT NULL,
    "approved_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readiness_snapshot" JSONB NOT NULL,
    "ranking_snapshot" JSONB NOT NULL,
    "approval_reason" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "organization_id" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "request_hash" TEXT NOT NULL,
    "actor_membership_id" UUID NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("organization_id","key")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(3),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "parts_organization_id_id_key" ON "parts"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "parts_organization_id_sku_key" ON "parts"("organization_id", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "stock_locations_organization_id_id_key" ON "stock_locations"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_locations_organization_id_branch_id_name_key" ON "stock_locations"("organization_id", "branch_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "job_parts_organization_id_id_key" ON "job_parts"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "job_parts_organization_id_job_id_part_id_location_id_key" ON "job_parts"("organization_id", "job_id", "part_id", "location_id");

-- CreateIndex
CREATE INDEX "part_confirmations_organization_id_job_part_id_confirmed_at_idx" ON "part_confirmations"("organization_id", "job_part_id", "confirmed_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "job_prerequisites_organization_id_id_key" ON "job_prerequisites"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "job_prerequisites_organization_id_job_id_code_key" ON "job_prerequisites"("organization_id", "job_id", "code");

-- CreateIndex
CREATE INDEX "prerequisite_evidence_organization_id_prerequisite_id_verif_idx" ON "prerequisite_evidence"("organization_id", "prerequisite_id", "verified_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_reservation_id_key" ON "assignments"("reservation_id");

-- CreateIndex
CREATE INDEX "assignments_organization_id_technician_id_resolved_at_idx" ON "assignments"("organization_id", "technician_id", "resolved_at");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_organization_id_id_key" ON "assignments"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_organization_id_job_id_technician_id_reservatio_key" ON "assignments"("organization_id", "job_id", "technician_id", "reservation_id");

-- CreateIndex
CREATE INDEX "outbox_events_published_at_created_at_idx" ON "outbox_events"("published_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_organization_id_assignment_id_kind_key" ON "outbox_events"("organization_id", "assignment_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_reservations_organization_id_job_id_technician__key" ON "appointment_reservations"("organization_id", "job_id", "technician_id", "id");

-- AddForeignKey
ALTER TABLE "parts" ADD CONSTRAINT "parts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_locations" ADD CONSTRAINT "stock_locations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_locations" ADD CONSTRAINT "stock_locations_organization_id_branch_id_fkey" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_parts" ADD CONSTRAINT "job_parts_organization_id_job_id_fkey" FOREIGN KEY ("organization_id", "job_id") REFERENCES "jobs"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_parts" ADD CONSTRAINT "job_parts_organization_id_part_id_fkey" FOREIGN KEY ("organization_id", "part_id") REFERENCES "parts"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_parts" ADD CONSTRAINT "job_parts_organization_id_location_id_fkey" FOREIGN KEY ("organization_id", "location_id") REFERENCES "stock_locations"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_confirmations" ADD CONSTRAINT "part_confirmations_organization_id_job_part_id_fkey" FOREIGN KEY ("organization_id", "job_part_id") REFERENCES "job_parts"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_confirmations" ADD CONSTRAINT "part_confirmations_organization_id_confirmed_by_membership_fkey" FOREIGN KEY ("organization_id", "confirmed_by_membership_id") REFERENCES "memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_prerequisites" ADD CONSTRAINT "job_prerequisites_organization_id_job_id_fkey" FOREIGN KEY ("organization_id", "job_id") REFERENCES "jobs"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prerequisite_evidence" ADD CONSTRAINT "prerequisite_evidence_organization_id_prerequisite_id_fkey" FOREIGN KEY ("organization_id", "prerequisite_id") REFERENCES "job_prerequisites"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prerequisite_evidence" ADD CONSTRAINT "prerequisite_evidence_organization_id_verified_by_membersh_fkey" FOREIGN KEY ("organization_id", "verified_by_membership_id") REFERENCES "memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_organization_id_job_id_fkey" FOREIGN KEY ("organization_id", "job_id") REFERENCES "jobs"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_organization_id_technician_id_fkey" FOREIGN KEY ("organization_id", "technician_id") REFERENCES "technicians"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_organization_id_job_id_technician_id_reservati_fkey" FOREIGN KEY ("organization_id", "job_id", "technician_id", "reservation_id") REFERENCES "appointment_reservations"("organization_id", "job_id", "technician_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_organization_id_approved_by_membership_id_fkey" FOREIGN KEY ("organization_id", "approved_by_membership_id") REFERENCES "memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_organization_id_actor_membership_id_fkey" FOREIGN KEY ("organization_id", "actor_membership_id") REFERENCES "memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_organization_id_assignment_id_fkey" FOREIGN KEY ("organization_id", "assignment_id") REFERENCES "assignments"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE organizations ADD CONSTRAINT parts_freshness_range CHECK (parts_freshness_hours BETWEEN 1 AND 168), ADD CONSTRAINT preparation_policy_positive CHECK (preparation_policy_version > 0);
ALTER TABLE jobs ADD CONSTRAINT visit_revision_positive CHECK (visit_revision > 0);
ALTER TABLE job_parts ADD CONSTRAINT part_positive_quantity CHECK (quantity > 0), ADD CONSTRAINT part_positive_revision CHECK (revision > 0);
ALTER TABLE part_confirmations ADD CONSTRAINT confirmation_positive_versions CHECK (requirement_revision > 0 AND visit_revision > 0 AND recorded_job_version > 0);
ALTER TABLE prerequisite_evidence ADD CONSTRAINT prerequisite_positive_versions CHECK (visit_revision > 0 AND recorded_job_version > 0), ADD CONSTRAINT prerequisite_evidence_status CHECK (status IN ('PASS','FAIL','UNKNOWN'));
ALTER TABLE job_prerequisites ADD CONSTRAINT prerequisite_kind CHECK (kind IN ('SAFETY','ACCESS'));
ALTER TABLE stock_locations ADD CONSTRAINT stock_location_kind CHECK (kind IN ('BRANCH','VAN'));
CREATE UNIQUE INDEX one_active_assignment_per_job ON assignments(organization_id, job_id) WHERE active;
COMMIT;

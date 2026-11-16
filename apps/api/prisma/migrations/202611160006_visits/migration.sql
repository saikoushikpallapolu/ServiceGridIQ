BEGIN;
-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('INITIAL', 'FOLLOW_UP');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JobStatus" ADD VALUE 'ACKNOWLEDGED';
ALTER TYPE "JobStatus" ADD VALUE 'IN_PROGRESS';
ALTER TYPE "JobStatus" ADD VALUE 'CLOSED';
ALTER TYPE "JobStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "cancellation_reason" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMPTZ(3),
ADD COLUMN     "job_type" "JobType" NOT NULL DEFAULT 'INITIAL',
ADD COLUMN     "parent_job_id" UUID,
ADD COLUMN     "root_job_id" UUID;

-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "acknowledged_at" TIMESTAMPTZ(3),
ADD COLUMN     "ended_at" TIMESTAMPTZ(3),
ADD COLUMN     "release_kind" TEXT,
ADD COLUMN     "release_reason" TEXT,
ADD COLUMN     "released_at" TIMESTAMPTZ(3),
ADD COLUMN     "started_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "visit_observations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "actor_membership_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "recorded_job_version" INTEGER NOT NULL,
    "part_id" UUID,
    "part_label" TEXT,
    "quantity" DECIMAL(12,3),
    "corrects_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_closures" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "actor_membership_id" UUID NOT NULL,
    "outcome" TEXT NOT NULL,
    "follow_up_reason" TEXT,
    "notes" TEXT NOT NULL,
    "closed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_closures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "visit_observations_organization_id_assignment_id_created_at_idx" ON "visit_observations"("organization_id", "assignment_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "visit_observations_organization_id_id_key" ON "visit_observations"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "visit_observations_organization_id_job_id_assignment_id_id_key" ON "visit_observations"("organization_id", "job_id", "assignment_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "visit_closures_job_id_key" ON "visit_closures"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "visit_closures_assignment_id_key" ON "visit_closures"("assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "visit_closures_organization_id_job_id_key" ON "visit_closures"("organization_id", "job_id");

-- CreateIndex
CREATE UNIQUE INDEX "visit_closures_organization_id_job_id_assignment_id_key" ON "visit_closures"("organization_id", "job_id", "assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_parent_job_id_key" ON "jobs"("parent_job_id");

-- CreateIndex
CREATE INDEX "jobs_organization_id_root_job_id_idx" ON "jobs"("organization_id", "root_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_organization_id_parent_job_id_key" ON "jobs"("organization_id", "parent_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_organization_id_job_id_id_key" ON "assignments"("organization_id", "job_id", "id");

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_organization_id_parent_job_id_fkey" FOREIGN KEY ("organization_id", "parent_job_id") REFERENCES "jobs"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_organization_id_root_job_id_fkey" FOREIGN KEY ("organization_id", "root_job_id") REFERENCES "jobs"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_observations" ADD CONSTRAINT "visit_observations_organization_id_job_id_fkey" FOREIGN KEY ("organization_id", "job_id") REFERENCES "jobs"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_observations" ADD CONSTRAINT "visit_observations_organization_id_job_id_assignment_id_fkey" FOREIGN KEY ("organization_id", "job_id", "assignment_id") REFERENCES "assignments"("organization_id", "job_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_observations" ADD CONSTRAINT "visit_observations_organization_id_actor_membership_id_fkey" FOREIGN KEY ("organization_id", "actor_membership_id") REFERENCES "memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_observations" ADD CONSTRAINT "visit_observations_organization_id_part_id_fkey" FOREIGN KEY ("organization_id", "part_id") REFERENCES "parts"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_observations" ADD CONSTRAINT "visit_observations_organization_id_job_id_assignment_id_co_fkey" FOREIGN KEY ("organization_id", "job_id", "assignment_id", "corrects_id") REFERENCES "visit_observations"("organization_id", "job_id", "assignment_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_closures" ADD CONSTRAINT "visit_closures_organization_id_job_id_fkey" FOREIGN KEY ("organization_id", "job_id") REFERENCES "jobs"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_closures" ADD CONSTRAINT "visit_closures_organization_id_job_id_assignment_id_fkey" FOREIGN KEY ("organization_id", "job_id", "assignment_id") REFERENCES "assignments"("organization_id", "job_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_closures" ADD CONSTRAINT "visit_closures_organization_id_actor_membership_id_fkey" FOREIGN KEY ("organization_id", "actor_membership_id") REFERENCES "memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE jobs ADD CONSTRAINT follow_up_shape CHECK ((job_type = 'INITIAL' AND parent_job_id IS NULL AND root_job_id IS NULL) OR (job_type = 'FOLLOW_UP' AND parent_job_id IS NOT NULL AND root_job_id IS NOT NULL AND parent_job_id <> id AND root_job_id <> id));
ALTER TABLE assignments ADD CONSTRAINT actual_visit_chronology CHECK ((started_at IS NULL OR (acknowledged_at IS NOT NULL AND started_at >= acknowledged_at)) AND (ended_at IS NULL OR (started_at IS NOT NULL AND ended_at >= started_at))), ADD CONSTRAINT assignment_release_shape CHECK (release_kind IS NULL OR (release_kind IN ('CLOSED','CANCELLED','RESCHEDULED') AND released_at IS NOT NULL AND NOT active));
CREATE UNIQUE INDEX one_in_progress_visit_per_technician ON assignments(organization_id, technician_id) WHERE active AND started_at IS NOT NULL AND ended_at IS NULL;
ALTER TABLE visit_observations ADD CONSTRAINT observation_kind CHECK (kind IN ('NOTE','PART_USAGE','CORRECTION')), ADD CONSTRAINT observation_positive_version CHECK (recorded_job_version > 0), ADD CONSTRAINT observation_shape CHECK ((kind = 'PART_USAGE' AND quantity > 0 AND ((part_id IS NOT NULL) <> (part_label IS NOT NULL)) AND corrects_id IS NULL) OR (kind = 'NOTE' AND quantity IS NULL AND part_id IS NULL AND part_label IS NULL AND corrects_id IS NULL) OR (kind = 'CORRECTION' AND quantity IS NULL AND part_id IS NULL AND part_label IS NULL AND corrects_id IS NOT NULL AND corrects_id <> id));
ALTER TABLE visit_closures ADD CONSTRAINT closure_outcome CHECK ((outcome = 'RESOLVED' AND follow_up_reason IS NULL) OR (outcome = 'FOLLOW_UP_REQUIRED' AND follow_up_reason IN ('PARTS','SKILLS','INFORMATION','ACCESS','NEW_FAULT','CUSTOMER_REQUEST','OTHER'))), ADD CONSTRAINT closure_notes CHECK (length(trim(notes)) BETWEEN 1 AND 4000);
COMMIT;

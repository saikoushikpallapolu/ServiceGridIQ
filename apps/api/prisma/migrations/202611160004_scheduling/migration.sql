BEGIN;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateEnum
CREATE TYPE "AvailabilityKind" AS ENUM ('SHIFT', 'UNAVAILABLE');

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "name_key" TEXT NOT NULL,
    "address" TEXT NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "name_key" TEXT NOT NULL,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technicians" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "safety_restricted" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "technicians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technician_skills" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "technician_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "level" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" TIMESTAMPTZ(3),
    "verified_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_by_membership_id" UUID NOT NULL,
    "evidence" TEXT NOT NULL,

    CONSTRAINT "technician_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "technician_id" UUID NOT NULL,
    "kind" "AvailabilityKind" NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT NOT NULL,

    CONSTRAINT "availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_scheduling" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "allow_cross_branch" BOOLEAN NOT NULL DEFAULT false,
    "general_inspection" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "job_scheduling_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_skill_requirements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "scheduling_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "level" INTEGER NOT NULL,

    CONSTRAINT "job_skill_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_reservations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "technician_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "reserved_from" TIMESTAMPTZ(3) NOT NULL,
    "planned_start" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "appointment_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "branches_organization_id_id_key" ON "branches"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "branches_organization_id_name_key_key" ON "branches"("organization_id", "name_key");

-- CreateIndex
CREATE UNIQUE INDEX "skills_organization_id_id_key" ON "skills"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "skills_organization_id_name_key_key" ON "skills"("organization_id", "name_key");

-- CreateIndex
CREATE UNIQUE INDEX "technicians_membership_id_key" ON "technicians"("membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "technicians_organization_id_id_key" ON "technicians"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "technicians_organization_id_membership_id_key" ON "technicians"("organization_id", "membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "technician_skills_organization_id_technician_id_skill_id_key" ON "technician_skills"("organization_id", "technician_id", "skill_id");

-- CreateIndex
CREATE INDEX "availability_organization_id_technician_id_starts_at_idx" ON "availability"("organization_id", "technician_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "job_scheduling_job_id_key" ON "job_scheduling"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_scheduling_organization_id_id_key" ON "job_scheduling"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "job_scheduling_organization_id_job_id_key" ON "job_scheduling"("organization_id", "job_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_skill_requirements_organization_id_scheduling_id_skill__key" ON "job_skill_requirements"("organization_id", "scheduling_id", "skill_id");

-- CreateIndex
CREATE INDEX "appointment_reservations_organization_id_technician_id_rese_idx" ON "appointment_reservations"("organization_id", "technician_id", "reserved_from");

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technicians" ADD CONSTRAINT "technicians_organization_id_membership_id_fkey" FOREIGN KEY ("organization_id", "membership_id") REFERENCES "memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technicians" ADD CONSTRAINT "technicians_organization_id_branch_id_fkey" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technician_skills" ADD CONSTRAINT "technician_skills_organization_id_technician_id_fkey" FOREIGN KEY ("organization_id", "technician_id") REFERENCES "technicians"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technician_skills" ADD CONSTRAINT "technician_skills_organization_id_skill_id_fkey" FOREIGN KEY ("organization_id", "skill_id") REFERENCES "skills"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technician_skills" ADD CONSTRAINT "technician_skills_organization_id_verified_by_membership_i_fkey" FOREIGN KEY ("organization_id", "verified_by_membership_id") REFERENCES "memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability" ADD CONSTRAINT "availability_organization_id_technician_id_fkey" FOREIGN KEY ("organization_id", "technician_id") REFERENCES "technicians"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_scheduling" ADD CONSTRAINT "job_scheduling_organization_id_job_id_fkey" FOREIGN KEY ("organization_id", "job_id") REFERENCES "jobs"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_scheduling" ADD CONSTRAINT "job_scheduling_organization_id_branch_id_fkey" FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_skill_requirements" ADD CONSTRAINT "job_skill_requirements_organization_id_scheduling_id_fkey" FOREIGN KEY ("organization_id", "scheduling_id") REFERENCES "job_scheduling"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_skill_requirements" ADD CONSTRAINT "job_skill_requirements_organization_id_skill_id_fkey" FOREIGN KEY ("organization_id", "skill_id") REFERENCES "skills"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_reservations" ADD CONSTRAINT "appointment_reservations_organization_id_technician_id_fkey" FOREIGN KEY ("organization_id", "technician_id") REFERENCES "technicians"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_reservations" ADD CONSTRAINT "appointment_reservations_organization_id_job_id_fkey" FOREIGN KEY ("organization_id", "job_id") REFERENCES "jobs"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE technicians ADD CONSTRAINT technicians_positive_version CHECK (version > 0);
ALTER TABLE technician_skills ADD CONSTRAINT technician_skill_level CHECK (level BETWEEN 1 AND 3);
ALTER TABLE job_skill_requirements ADD CONSTRAINT job_skill_level CHECK (level BETWEEN 1 AND 3);
ALTER TABLE availability ADD CONSTRAINT availability_positive_interval CHECK (ends_at > starts_at AND ends_at <= starts_at + INTERVAL '7 days');
ALTER TABLE availability ADD CONSTRAINT availability_no_same_kind_overlap EXCLUDE USING gist (organization_id WITH =, technician_id WITH =, kind WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&);
ALTER TABLE appointment_reservations ADD CONSTRAINT reservation_positive_interval CHECK (reserved_from <= planned_start AND planned_start < ends_at);
ALTER TABLE appointment_reservations ADD CONSTRAINT reservation_no_overlap EXCLUDE USING gist (organization_id WITH =, technician_id WITH =, tstzrange(reserved_from, ends_at, '[)') WITH &&) WHERE (active);
CREATE UNIQUE INDEX one_active_reservation_per_job ON appointment_reservations (organization_id, job_id) WHERE active;
COMMIT;

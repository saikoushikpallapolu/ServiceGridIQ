-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('DRAFT', 'TRIAGED');

-- CreateEnum
CREATE TYPE "JobPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_sites" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "access_notes" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "service_sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "serial_number" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "equipment_id" UUID NOT NULL,
    "complaint" TEXT NOT NULL,
    "priority" "JobPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "JobStatus" NOT NULL DEFAULT 'DRAFT',
    "arrival_start" TIMESTAMPTZ(3) NOT NULL,
    "arrival_end" TIMESTAMPTZ(3) NOT NULL,
    "estimated_duration_minutes" INTEGER NOT NULL,
    "travel_buffer_minutes" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "actor_membership_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_organization_id_name_id_idx" ON "customers"("organization_id", "name", "id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_organization_id_id_key" ON "customers"("organization_id", "id");

-- CreateIndex
CREATE INDEX "service_sites_organization_id_customer_id_idx" ON "service_sites"("organization_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_sites_organization_id_id_key" ON "service_sites"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "service_sites_organization_id_customer_id_id_key" ON "service_sites"("organization_id", "customer_id", "id");

-- CreateIndex
CREATE INDEX "equipment_organization_id_site_id_idx" ON "equipment"("organization_id", "site_id");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_organization_id_id_key" ON "equipment"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_organization_id_site_id_id_key" ON "equipment"("organization_id", "site_id", "id");

-- CreateIndex
CREATE INDEX "jobs_organization_id_created_at_id_idx" ON "jobs"("organization_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "jobs_organization_id_status_priority_idx" ON "jobs"("organization_id", "status", "priority");

-- CreateIndex
CREATE INDEX "jobs_organization_id_equipment_id_created_at_idx" ON "jobs"("organization_id", "equipment_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_organization_id_id_key" ON "jobs"("organization_id", "id");

-- CreateIndex
CREATE INDEX "job_events_organization_id_job_id_created_at_id_idx" ON "job_events"("organization_id", "job_id", "created_at", "id");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_sites" ADD CONSTRAINT "service_sites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_sites" ADD CONSTRAINT "service_sites_organization_id_customer_id_fkey" FOREIGN KEY ("organization_id", "customer_id") REFERENCES "customers"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_organization_id_site_id_fkey" FOREIGN KEY ("organization_id", "site_id") REFERENCES "service_sites"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_organization_id_customer_id_site_id_fkey" FOREIGN KEY ("organization_id", "customer_id", "site_id") REFERENCES "service_sites"("organization_id", "customer_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_organization_id_site_id_equipment_id_fkey" FOREIGN KEY ("organization_id", "site_id", "equipment_id") REFERENCES "equipment"("organization_id", "site_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_organization_id_job_id_fkey" FOREIGN KEY ("organization_id", "job_id") REFERENCES "jobs"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_organization_id_actor_membership_id_fkey" FOREIGN KEY ("organization_id", "actor_membership_id") REFERENCES "memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Application validation is backed by database constraints for direct writes.
ALTER TABLE jobs ADD CONSTRAINT jobs_arrival_window_check CHECK (arrival_end > arrival_start AND arrival_end <= arrival_start + INTERVAL '7 days'), ADD CONSTRAINT jobs_duration_check CHECK (estimated_duration_minutes BETWEEN 15 AND 1440), ADD CONSTRAINT jobs_buffer_check CHECK (travel_buffer_minutes BETWEEN 0 AND 480), ADD CONSTRAINT jobs_version_check CHECK (version > 0), ADD CONSTRAINT jobs_complaint_check CHECK (length(trim(complaint)) BETWEEN 1 AND 4000);
ALTER TABLE customers ADD CONSTRAINT customers_version_check CHECK (version > 0), ADD CONSTRAINT customers_name_check CHECK (length(trim(name)) BETWEEN 1 AND 160);
ALTER TABLE service_sites ADD CONSTRAINT sites_version_check CHECK (version > 0);
ALTER TABLE equipment ADD CONSTRAINT equipment_version_check CHECK (version > 0);

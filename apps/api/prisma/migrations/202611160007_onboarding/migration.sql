BEGIN;
-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_membership_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "source_system" TEXT NOT NULL,
    "file_hash" TEXT NOT NULL,
    "payload" JSONB,
    "validation" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "committed_at" TIMESTAMPTZ(3),

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_records" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "source_system" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "internal_id" UUID NOT NULL,
    "content_hash" TEXT NOT NULL,

    CONSTRAINT "external_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_exclusions" (
    "job_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_membership_id" UUID NOT NULL,
    "reason" TEXT,
    "note" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "report_exclusions_pkey" PRIMARY KEY ("job_id")
);

-- CreateIndex
CREATE INDEX "import_batches_expires_at_idx" ON "import_batches"("expires_at");

-- CreateIndex
CREATE INDEX "import_batches_organization_id_created_at_id_idx" ON "import_batches"("organization_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "import_batches_organization_id_id_key" ON "import_batches"("organization_id", "id");

-- CreateIndex
CREATE INDEX "external_records_organization_id_kind_internal_id_idx" ON "external_records"("organization_id", "kind", "internal_id");

-- CreateIndex
CREATE UNIQUE INDEX "external_records_organization_id_source_system_kind_externa_key" ON "external_records"("organization_id", "source_system", "kind", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "report_exclusions_organization_id_job_id_key" ON "report_exclusions"("organization_id", "job_id");

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_organization_id_actor_membership_id_fkey" FOREIGN KEY ("organization_id", "actor_membership_id") REFERENCES "memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_records" ADD CONSTRAINT "external_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_exclusions" ADD CONSTRAINT "report_exclusions_organization_id_job_id_fkey" FOREIGN KEY ("organization_id", "job_id") REFERENCES "jobs"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_exclusions" ADD CONSTRAINT "report_exclusions_organization_id_actor_membership_id_fkey" FOREIGN KEY ("organization_id", "actor_membership_id") REFERENCES "memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE import_batches ADD CONSTRAINT import_batch_kind CHECK (kind IN ('customers','sites','equipment','technicians','jobs','parts')), ADD CONSTRAINT import_batch_status CHECK (status IN ('VALIDATED','INVALID','COMMITTED')), ADD CONSTRAINT import_expiry CHECK (expires_at > created_at), ADD CONSTRAINT import_hash CHECK (file_hash ~ '^[a-f0-9]{64}$'), ADD CONSTRAINT import_commit_shape CHECK ((status = 'COMMITTED') = (committed_at IS NOT NULL));
ALTER TABLE external_records ADD CONSTRAINT external_record_kind CHECK (kind IN ('customers','sites','equipment','technicians','jobs','parts')), ADD CONSTRAINT external_id_nonempty CHECK (length(external_id) BETWEEN 1 AND 160), ADD CONSTRAINT external_content_hash CHECK (content_hash ~ '^[a-f0-9]{64}$');
ALTER TABLE report_exclusions ADD CONSTRAINT report_exclusion_reason CHECK (reason IS NULL OR reason IN ('PLANNED_MULTI_VISIT','DATA_QUALITY')), ADD CONSTRAINT report_exclusion_version CHECK (version > 0), ADD CONSTRAINT report_exclusion_note CHECK (length(trim(note)) BETWEEN 1 AND 2000);
COMMIT;

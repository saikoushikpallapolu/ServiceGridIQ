BEGIN;
CREATE EXTENSION IF NOT EXISTS vector;
-- CreateTable
CREATE TABLE "manual_documents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "uploaded_by_id" UUID NOT NULL,
    "approved_by_id" UUID,
    "title" TEXT NOT NULL,
    "document_version" TEXT NOT NULL,
    "manufacturer_key" TEXT NOT NULL,
    "model_key" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "file_hash" TEXT NOT NULL,
    "media_type" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUARANTINED',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "allow_external_ai" BOOLEAN NOT NULL DEFAULT false,
    "review_note" TEXT NOT NULL DEFAULT '',
    "failure_code" TEXT,
    "pages" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "manual_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_chunks" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "page" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536),
    "embedding_model" TEXT,
    "search" tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,

    CONSTRAINT "manual_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_usage" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "reserved_tokens" INTEGER NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "manual_documents_object_key_key" ON "manual_documents"("object_key");

-- CreateIndex
CREATE INDEX "manual_documents_organization_id_status_idx" ON "manual_documents"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "manual_documents_organization_id_id_key" ON "manual_documents"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "manual_documents_organization_id_manufacturer_key_model_key_key" ON "manual_documents"("organization_id", "manufacturer_key", "model_key", "title", "document_version");

-- CreateIndex
CREATE UNIQUE INDEX "manual_chunks_organization_id_id_key" ON "manual_chunks"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "manual_chunks_organization_id_document_id_revision_ordinal_key" ON "manual_chunks"("organization_id", "document_id", "revision", "ordinal");

-- CreateIndex
CREATE INDEX "provider_usage_organization_id_created_at_idx" ON "provider_usage"("organization_id", "created_at");

-- AddForeignKey
ALTER TABLE "manual_documents" ADD CONSTRAINT "manual_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_documents" ADD CONSTRAINT "manual_documents_organization_id_uploaded_by_id_fkey" FOREIGN KEY ("organization_id", "uploaded_by_id") REFERENCES "memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_documents" ADD CONSTRAINT "manual_documents_organization_id_approved_by_id_fkey" FOREIGN KEY ("organization_id", "approved_by_id") REFERENCES "memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_chunks" ADD CONSTRAINT "manual_chunks_organization_id_document_id_fkey" FOREIGN KEY ("organization_id", "document_id") REFERENCES "manual_documents"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_usage" ADD CONSTRAINT "provider_usage_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX manual_chunk_search_idx ON manual_chunks USING gin(search);
ALTER TABLE manual_documents ADD CONSTRAINT manual_status CHECK (status IN ('QUARANTINED','QUEUED','PROCESSING','READY','FAILED','REVOKED')), ADD CONSTRAINT manual_revision CHECK (revision > 0), ADD CONSTRAINT manual_bytes CHECK (bytes BETWEEN 1 AND 5242880), ADD CONSTRAINT manual_pages CHECK (pages BETWEEN 0 AND 100);
ALTER TABLE manual_chunks ADD CONSTRAINT chunk_bounds CHECK (page BETWEEN 1 AND 100 AND ordinal >= 0 AND revision > 0 AND length(content) BETWEEN 1 AND 1800);
ALTER TABLE provider_usage ADD CONSTRAINT usage_tokens CHECK (reserved_tokens >= 0 AND input_tokens >= 0 AND output_tokens >= 0), ADD CONSTRAINT usage_status CHECK (status IN ('RESERVED','SUCCEEDED','FAILED'));
COMMIT;

BEGIN;
-- DropIndex


-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "inventory_mode" TEXT NOT NULL DEFAULT 'MANUAL';

-- AlterTable


-- CreateTable
CREATE TABLE "inventory_policies" (
    "organization_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "inventory_policies_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "stock_balances" (
    "organization_id" UUID NOT NULL,
    "part_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "on_hand" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "reserved" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("organization_id","part_id","location_id")
);

-- CreateTable
CREATE TABLE "stock_allocations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "job_part_id" UUID NOT NULL,
    "part_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "consumed" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "state" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "stock_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_membership_id" UUID NOT NULL,
    "part_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "allocation_id" UUID,
    "return_of_id" UUID,
    "kind" TEXT NOT NULL,
    "delta_on_hand" DECIMAL(12,3) NOT NULL,
    "delta_reserved" DECIMAL(12,3) NOT NULL,
    "balance_version" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_allocations_organization_id_job_id_idx" ON "stock_allocations"("organization_id", "job_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_allocations_organization_id_id_key" ON "stock_allocations"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_allocations_organization_id_assignment_id_job_part_id_key" ON "stock_allocations"("organization_id", "assignment_id", "job_part_id");

-- CreateIndex
CREATE INDEX "stock_movements_organization_id_created_at_id_idx" ON "stock_movements"("organization_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "stock_movements_organization_id_return_of_id_idx" ON "stock_movements"("organization_id", "return_of_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_organization_id_id_key" ON "stock_movements"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_organization_id_part_id_location_id_balance_key" ON "stock_movements"("organization_id", "part_id", "location_id", "balance_version");

-- CreateIndex
CREATE UNIQUE INDEX "job_parts_organization_id_job_id_id_part_id_location_id_key" ON "job_parts"("organization_id", "job_id", "id", "part_id", "location_id");

-- AddForeignKey
ALTER TABLE "inventory_policies" ADD CONSTRAINT "inventory_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_organization_id_part_id_fkey" FOREIGN KEY ("organization_id", "part_id") REFERENCES "parts"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_organization_id_location_id_fkey" FOREIGN KEY ("organization_id", "location_id") REFERENCES "stock_locations"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_allocations" ADD CONSTRAINT "stock_allocations_organization_id_job_id_assignment_id_fkey" FOREIGN KEY ("organization_id", "job_id", "assignment_id") REFERENCES "assignments"("organization_id", "job_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_allocations" ADD CONSTRAINT "stock_allocations_organization_id_job_id_job_part_id_part__fkey" FOREIGN KEY ("organization_id", "job_id", "job_part_id", "part_id", "location_id") REFERENCES "job_parts"("organization_id", "job_id", "id", "part_id", "location_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_allocations" ADD CONSTRAINT "stock_allocations_organization_id_part_id_location_id_fkey" FOREIGN KEY ("organization_id", "part_id", "location_id") REFERENCES "stock_balances"("organization_id", "part_id", "location_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_organization_id_actor_membership_id_fkey" FOREIGN KEY ("organization_id", "actor_membership_id") REFERENCES "memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_organization_id_part_id_location_id_fkey" FOREIGN KEY ("organization_id", "part_id", "location_id") REFERENCES "stock_balances"("organization_id", "part_id", "location_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_organization_id_allocation_id_fkey" FOREIGN KEY ("organization_id", "allocation_id") REFERENCES "stock_allocations"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_organization_id_return_of_id_fkey" FOREIGN KEY ("organization_id", "return_of_id") REFERENCES "stock_movements"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE assignments ADD CONSTRAINT assignment_inventory_mode CHECK (inventory_mode IN ('MANUAL','LEDGER'));
ALTER TABLE inventory_policies ADD CONSTRAINT inventory_policy_version CHECK (version > 0);
ALTER TABLE stock_balances ADD CONSTRAINT stock_balance_bounds CHECK (on_hand >= 0 AND reserved >= 0 AND reserved <= on_hand AND version >= 0);
ALTER TABLE stock_allocations ADD CONSTRAINT allocation_shape CHECK (quantity > 0 AND consumed >= 0 AND consumed <= quantity AND ((state = 'ACTIVE' AND consumed < quantity) OR (state = 'CONSUMED' AND consumed = quantity) OR (state = 'RELEASED' AND consumed < quantity)));
ALTER TABLE stock_movements ADD CONSTRAINT stock_movement_kind CHECK (kind IN ('RECEIPT','RETURN','CORRECTION','RECONCILIATION','RESERVE','RELEASE','CONSUMPTION')), ADD CONSTRAINT stock_movement_version CHECK (balance_version > 0), ADD CONSTRAINT stock_movement_note CHECK (length(trim(note)) BETWEEN 1 AND 2000), ADD CONSTRAINT stock_movement_shape CHECK ((kind = 'RECEIPT' AND delta_on_hand > 0 AND delta_reserved = 0 AND return_of_id IS NULL AND allocation_id IS NULL) OR (kind = 'RETURN' AND delta_on_hand > 0 AND delta_reserved = 0 AND return_of_id IS NOT NULL) OR (kind IN ('CORRECTION','RECONCILIATION') AND delta_reserved = 0 AND return_of_id IS NULL AND allocation_id IS NULL) OR (kind = 'RESERVE' AND delta_on_hand = 0 AND delta_reserved > 0 AND allocation_id IS NOT NULL AND return_of_id IS NULL) OR (kind = 'RELEASE' AND delta_on_hand = 0 AND delta_reserved < 0 AND allocation_id IS NOT NULL AND return_of_id IS NULL) OR (kind = 'CONSUMPTION' AND delta_on_hand < 0 AND delta_reserved = delta_on_hand AND allocation_id IS NOT NULL AND return_of_id IS NULL));
CREATE FUNCTION protect_stock_movement_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Stock movements are append-only; create a compensating movement'; END $$;
CREATE TRIGGER stock_movements_no_update BEFORE UPDATE ON stock_movements FOR EACH ROW EXECUTE FUNCTION protect_stock_movement_update();
COMMIT;
